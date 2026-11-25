import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { describe, expect, it, vi } from "vitest";
import { CANVAS_COORDINATE_LIMIT, getNoteHeight } from "@/contracts/board";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { useBoardDrag } from "./use-board-drag";

const ME = "11111111-1111-4111-8111-111111111111";

// jsdom は getBoundingClientRect が常に 0 を返すため、rect を持つ疑似要素を
// ref として注入する（hook はビューポートの矩形しか参照しない）。
function fakeElementRef<T extends HTMLElement = HTMLDivElement>(rect: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): RefObject<T | null> {
  return {
    current: {
      getBoundingClientRect: () => rect,
      scrollLeft: 0,
      scrollTop: 0,
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as T,
  };
}

function fakeToolbarWithNotes(
  noteRects: Array<{
    noteId: string;
    top: number;
    bottom: number;
  }>,
  scrollContainer?: HTMLElement,
): RefObject<HTMLDivElement | null> {
  const initialScrollTop = scrollContainer?.scrollTop ?? 0;
  return {
    current: {
      getBoundingClientRect: () => ({
        left: 600,
        top: 80,
        right: 800,
        bottom: 620,
      }),
      querySelectorAll: () =>
        noteRects.map(({ noteId, top, bottom }) => ({
          dataset: { noteId },
          getBoundingClientRect: () => {
            const scrollOffset =
              initialScrollTop -
              (scrollContainer?.scrollTop ?? initialScrollTop);
            return {
              left: 600,
              right: 800,
              top: top + scrollOffset,
              bottom: bottom + scrollOffset,
              height: bottom - top,
            };
          },
        })),
      querySelector: (selector: string) =>
        selector === "[data-testid='private-notes-scroll']"
          ? (scrollContainer ?? null)
          : null,
    } as unknown as HTMLDivElement,
  };
}

function pointerEvent(
  pointerId: number,
  clientX: number,
  clientY: number,
): ReactPointerEvent<HTMLDivElement> & ReactPointerEvent<HTMLButtonElement> {
  return { pointerId, clientX, clientY } as ReactPointerEvent<HTMLDivElement> &
    ReactPointerEvent<HTMLButtonElement>;
}

function setup(overrides: Partial<Parameters<typeof useBoardDrag>[0]> = {}) {
  const args = {
    notes: [buildNote({ id: "shared-1", authorId: ME, x: 100, y: 100 })],
    privateNotes: [buildNote({ id: "private-1", authorId: ME, x: 0, y: 0 })],
    // ボード: 画面上部の 800x500。ツールバー: 下端の帯。
    boardRootRef: fakeElementRef({ left: 0, top: 0, right: 800, bottom: 600 }),
    boardScrollerRef: fakeElementRef({
      left: 0,
      top: 0,
      right: 800,
      bottom: 500,
    }),
    worldPointFromClient: (clientX: number, clientY: number) => ({
      x: clientX,
      y: clientY,
    }),
    privateToolbarRef: fakeElementRef({
      left: 200,
      top: 540,
      right: 600,
      bottom: 590,
    }),
    onNoteDragStart: vi.fn(),
    onNoteDragMove: vi.fn(),
    onNoteDragEnd: vi.fn(),
    onNoteDragCancel: vi.fn(),
    onPrivateNotePublish: vi.fn(),
    ...overrides,
  };
  const rendered = renderHook(() => useBoardDrag(args));
  return { args, ...rendered };
}

describe("useBoardDrag", () => {
  it("拡大した操作面からドラッグしても外側の付箋の寸法と掴み位置を使う", () => {
    const note = document.createElement("div");
    note.dataset.slot = "sticky-note";
    const surface = document.createElement("button");
    note.append(surface);
    note.getBoundingClientRect = () => new DOMRect(100, 100, 200, 150);
    surface.getBoundingClientRect = () => new DOMRect(90, 92.5, 220, 165);
    const event = {
      ...pointerEvent(1, 150, 140),
      currentTarget: surface,
    } as ReactPointerEvent<HTMLButtonElement>;
    const { result } = setup();
    act(() => result.current.handleSharedNoteDragStart("shared-1", event));
    expect(result.current.drag).toMatchObject({
      previewOffsetX: 50,
      previewOffsetY: 40,
      previewWidth: 200,
      previewHeight: 150,
    });
  });
  it("共有付箋のドラッグ開始時は閾値超過後の座標ではなく掴み始めの位置を保つ", () => {
    const rect = {
      left: 190,
      top: 480,
      right: 340,
      bottom: 590,
      width: 150,
      height: 110,
    };
    const event = {
      ...pointerEvent(1, 222, 514),
      currentTarget: { getBoundingClientRect: () => rect },
    } as ReactPointerEvent<HTMLButtonElement>;
    const { result } = setup();

    act(() => {
      result.current.handleSharedNoteDragStart("shared-1", event, {
        clientX: 210,
        clientY: 502,
      });
    });

    expect(result.current.drag?.previewOffsetX).toBe(20);
    expect(result.current.drag?.previewOffsetY).toBe(22);
    expect(result.current.drag?.clientX).toBe(222);
    expect(result.current.drag?.clientY).toBe(514);
  });

  it.each(["shared", "private"] as const)(
    "解放時に初めて認識した%s移動はcaptureを取り直さず終了する",
    (kind) => {
      const { args, result } = setup();
      const up = { ...pointerEvent(1, 250, 180), type: "pointerup" };
      act(() => {
        if (kind === "shared")
          result.current.handleSharedNoteDragStart("shared-1", up, {
            clientX: 100,
            clientY: 100,
          });
        else
          result.current.handlePrivateDragStart("private-1", up, {
            clientX: 300,
            clientY: 560,
          });
        result.current.handlePointerEnd(up);
      });
      expect(
        args.boardScrollerRef.current?.setPointerCapture,
      ).not.toHaveBeenCalled();
      if (kind === "shared")
        expect(args.onNoteDragEnd).toHaveBeenCalledExactlyOnceWith(
          "shared-1",
          250,
          180,
        );
      else expect(args.onPrivateNotePublish).toHaveBeenCalledOnce();
      expect(result.current.drag).toBeNull();
    },
  );
  it("最後のupがマイ付箋上でも共有付箋は戻さず、その座標で移動を確定する", () => {
    const { args, result } = setup();
    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
      result.current.handlePointerEnd(pointerEvent(1, 400, 560));
    });
    expect(args.onNoteDragEnd).toHaveBeenCalledExactlyOnceWith(
      "shared-1",
      400,
      560,
    );
    expect(result.current.drag).toBeNull();
  });
  it("マイ付箋上を通過してからボード上で離したら、その座標で移動を確定する", () => {
    const { args, result } = setup();
    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
      result.current.handlePointerMove(pointerEvent(1, 400, 560));
      result.current.handlePointerEnd(pointerEvent(1, 250, 180));
    });
    expect(args.onNoteDragEnd).toHaveBeenCalledExactlyOnceWith(
      "shared-1",
      250,
      180,
    );
    expect(result.current.drag).toBeNull();
  });
  it("AT-016: private preview中のpanel閉鎖は残るDOM/refでも取消する", async () => {
    const toolbar = document.createElement("div");
    toolbar.dataset.expanded = "true";
    toolbar.getBoundingClientRect = () =>
      ({
        left: 200,
        top: 540,
        right: 600,
        bottom: 590,
        width: 400,
        height: 50,
      }) as DOMRect;
    const { result, args } = setup({
      privateToolbarRef: { current: toolbar },
    });
    act(() => {
      result.current.handlePrivateDragStart(
        "private-1",
        pointerEvent(1, 400, 560),
      );
    });
    await act(async () => {
      toolbar.dataset.expanded = "false";
      await Promise.resolve();
    });
    expect(result.current.drag).toBeNull();
    act(() => result.current.handlePointerEnd(pointerEvent(1, 300, 200)));
    expect(args.onPrivateNotePublish).not.toHaveBeenCalled();
  });

  it("panel閉鎖と同じtickのpointerupでも公開しない", () => {
    const toolbar = document.createElement("div");
    toolbar.dataset.expanded = "true";
    toolbar.getBoundingClientRect = () =>
      ({
        left: 200,
        top: 540,
        right: 600,
        bottom: 590,
        width: 400,
        height: 50,
      }) as DOMRect;
    const { result, args } = setup({ privateToolbarRef: { current: toolbar } });
    act(() =>
      result.current.handlePrivateDragStart(
        "private-1",
        pointerEvent(1, 400, 560),
      ),
    );
    act(() => {
      toolbar.dataset.expanded = "false";
      result.current.handlePointerEnd(pointerEvent(1, 300, 200));
    });
    expect(args.onPrivateNotePublish).not.toHaveBeenCalled();
  });

  it.each([
    ["shared", "shared"],
    ["shared", "private"],
    ["private", "shared"],
    ["private", "private"],
  ] as const)(
    "%s ドラッグ中に別の指で %s 付箋を掴んでも、最初の操作を最後まで保つ",
    (firstKind, secondKind) => {
      const { args, result } = setup();
      const firstId = firstKind === "shared" ? "shared-1" : "private-1";
      const startFirst = () =>
        firstKind === "shared"
          ? result.current.handleSharedNoteDragStart(
              firstId,
              pointerEvent(7, 120, 130),
            )
          : result.current.handlePrivateDragStart(
              firstId,
              pointerEvent(7, 400, 560),
            );
      act(startFirst);
      act(() => {
        if (secondKind === "shared") {
          result.current.handleSharedNoteDragStart(
            "shared-1",
            pointerEvent(8, 250, 200),
          );
        } else {
          result.current.handlePrivateDragStart(
            "private-1",
            pointerEvent(8, 400, 560),
          );
        }
        result.current.handlePointerMove(pointerEvent(8, 500, 300));
        result.current.handlePointerEnd(pointerEvent(8, 500, 300));
      });

      expect(result.current.drag?.note.id).toBe(firstId);
      expect(result.current.isCurrentDragPointer(7)).toBe(true);
      expect(result.current.isCurrentDragPointer(8)).toBe(false);
      expect(
        args.boardScrollerRef.current?.setPointerCapture,
      ).toHaveBeenCalledTimes(1);
      expect(args.onNoteDragStart).toHaveBeenCalledTimes(
        firstKind === "shared" ? 1 : 0,
      );
      expect(args.onNoteDragMove).not.toHaveBeenCalled();
      expect(args.onNoteDragEnd).not.toHaveBeenCalled();
      expect(args.onPrivateNotePublish).not.toHaveBeenCalled();

      act(() => {
        result.current.handlePointerMove(pointerEvent(7, 300, 200));
        result.current.handlePointerEnd(pointerEvent(7, 300, 200));
      });
      if (firstKind === "shared") {
        expect(args.onNoteDragMove).toHaveBeenLastCalledWith(
          firstId,
          expect.any(Number),
          expect.any(Number),
        );
        expect(args.onNoteDragEnd).toHaveBeenLastCalledWith(
          firstId,
          expect.any(Number),
          expect.any(Number),
        );
      } else {
        expect(args.onPrivateNotePublish).toHaveBeenCalledWith(
          firstId,
          expect.any(Number),
          expect.any(Number),
        );
        expect(args.onNoteDragMove).not.toHaveBeenCalled();
      }
      expect(
        args.boardScrollerRef.current?.releasePointerCapture,
      ).toHaveBeenLastCalledWith(7);
      expect(result.current.drag).toBeNull();

      act(startFirst);
      act(() => result.current.handlePointerCancel(pointerEvent(7, 300, 200)));
      expect(result.current.drag).toBeNull();
    },
  );

  it("pointer cancel は確定位置を送らず操作権を即時解除する", () => {
    const { args, result } = setup();
    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(7, 120, 130),
      );
      result.current.handlePointerCancel(pointerEvent(7, 300, 400));
    });

    expect(args.onNoteDragCancel).toHaveBeenCalledWith("shared-1");
    expect(args.onNoteDragEnd).not.toHaveBeenCalled();
    expect(result.current.drag).toBeNull();
  });

  it("presence leave 用の解除は private drag を中断しない", () => {
    const { args, result } = setup();
    act(() => {
      result.current.handlePrivateDragStart(
        "private-1",
        pointerEvent(8, 400, 560),
      );
      result.current.cancelCurrentNoteDrag();
    });

    expect(args.onNoteDragCancel).not.toHaveBeenCalled();
    expect(result.current.drag?.status).toBe("private");
  });

  it("共有付箋のドラッグ開始で shared 状態になり onNoteDragStart を呼ぶ", () => {
    const { args, result } = setup();

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
    });

    expect(result.current.drag?.status).toBe("shared");
    expect(args.onNoteDragStart).toHaveBeenCalledWith("shared-1");
  });

  it("共有付箋のドラッグはボード内でポインターを捕捉し、境界離脱による即時キャンセルを防ぐ", () => {
    const { args, result } = setup();

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(9, 120, 130),
      );
    });

    expect(
      args.boardScrollerRef.current?.setPointerCapture,
    ).toHaveBeenCalledWith(9);
    expect(args.boardRootRef.current?.setPointerCapture).not.toHaveBeenCalled();
  });

  it("AT-014: private preview は境界を跨いでも送信せず有効pointerupだけ公開する", () => {
    const { args, result } = setup();
    act(() =>
      result.current.handlePrivateDragStart(
        "private-1",
        pointerEvent(1, 400, 560),
      ),
    );
    act(() => result.current.handlePointerMove(pointerEvent(1, 300, 200)));
    expect(args.onPrivateNotePublish).not.toHaveBeenCalled();
    expect(args.onNoteDragStart).not.toHaveBeenCalled();
    expect(args.onNoteDragMove).not.toHaveBeenCalled();
    expect(result.current.drag?.x).toBe(300);
    act(() => result.current.handlePointerEnd(pointerEvent(1, 310, 210)));
    expect(args.onPrivateNotePublish).toHaveBeenCalledWith(
      "private-1",
      310,
      210,
    );
  });

  it.each(["cancel", "outside", "roundtrip"])(
    "AT-015: %s はprivateを公開しない",
    (kind) => {
      const { args, result } = setup();
      act(() =>
        result.current.handlePrivateDragStart(
          "private-1",
          pointerEvent(1, 400, 560),
        ),
      );
      act(() => result.current.handlePointerMove(pointerEvent(1, 300, 200)));
      act(() => {
        if (kind === "cancel")
          result.current.handlePointerCancel(pointerEvent(1, 300, 200));
        else
          result.current.handlePointerEnd(
            pointerEvent(1, kind === "outside" ? 900 : 400, 560),
          );
      });
      expect(args.onPrivateNotePublish).not.toHaveBeenCalled();
      expect(args.onNoteDragMove).not.toHaveBeenCalled();
    },
  );

  it("マイ付箋の有効dropはpublish一件で確定しdrag配信しない", () => {
    const { args, result } = setup();

    act(() => {
      result.current.handlePrivateDragStart(
        "private-1",
        pointerEvent(1, 400, 560),
      );
    });
    expect(result.current.drag?.status).toBe("private");

    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 300, 200));
    });

    expect(args.onPrivateNotePublish).not.toHaveBeenCalled();
    act(() => result.current.handlePointerEnd(pointerEvent(1, 300, 200)));
    expect(args.onPrivateNotePublish).toHaveBeenCalledWith(
      "private-1",
      300,
      200,
    );
    expect(args.onNoteDragStart).not.toHaveBeenCalled();
    expect(args.onNoteDragMove).not.toHaveBeenCalled();
    expect(result.current.drag).toBeNull();
  });

  it("private map preview はpointerdownからdock内pointerupまで送信しない", () => {
    const { args, result } = setup();

    act(() => {
      result.current.handlePrivateDragStart(
        "private-1",
        pointerEvent(12, 400, 560),
      );
    });
    expect(args.onNoteDragStart).not.toHaveBeenCalled();

    act(() => {
      result.current.handlePointerEnd(pointerEvent(12, 400, 560));
    });
    expect(args.onNoteDragCancel).not.toHaveBeenCalled();
    expect(args.onPrivateNotePublish).not.toHaveBeenCalled();
  });

  it("private map preview のpointercancelは送信せず終了する", () => {
    const { args, result } = setup();

    act(() => {
      result.current.handlePrivateDragStart(
        "private-1",
        pointerEvent(13, 400, 560),
      );
      result.current.handlePointerCancel(pointerEvent(13, 700, 200));
    });

    expect(args.onNoteDragStart).not.toHaveBeenCalled();
    expect(args.onNoteDragCancel).not.toHaveBeenCalled();
    expect(result.current.drag).toBeNull();
  });

  it("2軸マップへ共有するとマイ付箋をポインター位置の連続座標で配置する", () => {
    const mapCoordinateOptions = {
      preservePrivateGrabOffset: false,
      clampCoordinate: (coordinate: number) =>
        Math.min(100, Math.max(0, coordinate)),
    } as Partial<Parameters<typeof useBoardDrag>[0]>;
    const { args, result } = setup({
      worldPointFromClient: () => ({ x: 50, y: 50 }),
      ...mapCoordinateOptions,
    });
    const event = pointerEvent(1, 400, 560);
    Object.defineProperty(event, "currentTarget", {
      value: {
        getBoundingClientRect: () => ({
          left: 300,
          top: 500,
          right: 500,
          bottom: 650,
          width: 200,
          height: 150,
        }),
      },
    });

    act(() => {
      result.current.handlePrivateDragStart("private-1", event);
      result.current.handlePointerMove(pointerEvent(1, 300, 200));
      result.current.handlePointerEnd(pointerEvent(1, 300, 200));
    });

    expect(args.onPrivateNotePublish).toHaveBeenCalledWith("private-1", 50, 50);
    expect(args.onNoteDragEnd).not.toHaveBeenCalled();
  });

  it("マイ付箋エリア内でドラッグした付箋の並び順を変更する", () => {
    const { args, result } = setup({
      privateNotes: [
        buildNote({ id: "private-1", authorId: ME, visibility: "private" }),
        buildNote({ id: "private-2", authorId: ME, visibility: "private" }),
        buildNote({ id: "private-3", authorId: ME, visibility: "private" }),
      ],
    });

    act(() => {
      result.current.handlePrivateDragStart(
        "private-1",
        pointerEvent(1, 250, 589),
      );
      result.current.handlePointerMove(pointerEvent(1, 580, 589));
      result.current.handlePointerEnd(pointerEvent(1, 580, 589));
    });

    expect(result.current.renderedPrivateNotes.map((note) => note.id)).toEqual([
      "private-2",
      "private-3",
      "private-1",
    ]);
    expect(args.onPrivateNotePublish).not.toHaveBeenCalled();
  });

  it("並び替え後に別の付箋を抜いても残った付箋の相対順を維持する", () => {
    const initialPrivateNotes = [
      buildNote({ id: "a", authorId: ME, visibility: "private" }),
      buildNote({ id: "c", authorId: ME, visibility: "private" }),
      buildNote({ id: "b", authorId: ME, visibility: "private" }),
    ];
    const { args, result, rerender } = setup({
      privateNotes: [...initialPrivateNotes],
    });

    // サーバー上は a,c,b でも、b を中央へ移動して表示順を a,b,c にする。
    act(() => {
      result.current.handlePrivateDragStart("b", pointerEvent(1, 580, 560));
      result.current.handlePointerMove(pointerEvent(1, 330, 560));
      result.current.handlePointerEnd(pointerEvent(1, 330, 560));
    });
    expect(result.current.renderedPrivateNotes.map((note) => note.id)).toEqual([
      "a",
      "b",
      "c",
    ]);

    // a をボードへ抜いた後は、古い固定位置で b を末尾へ送らず b,c を保つ。
    args.privateNotes = args.privateNotes.filter((note) => note.id !== "a");
    rerender();
    expect(result.current.renderedPrivateNotes.map((note) => note.id)).toEqual([
      "b",
      "c",
    ]);
  });

  it("個人付箋のドラッグ中にリストの上下端へ近づくと自動スクロールする", () => {
    const scrollContainer = {
      getBoundingClientRect: () => ({
        left: 600,
        top: 100,
        right: 800,
        bottom: 500,
        height: 400,
        width: 200,
      }),
      scrollTop: 100,
      scrollHeight: 1000,
      clientHeight: 400,
    } as HTMLElement;
    const toolbarRef = fakeToolbarWithNotes(
      [
        { noteId: "private-1", top: 140, bottom: 220 },
        { noteId: "private-2", top: 280, bottom: 360 },
        { noteId: "private-3", top: 420, bottom: 564 },
      ],
      scrollContainer,
    );
    const pendingFrames = new Map<number, FrameRequestCallback>();
    const cancelledFrames: number[] = [];
    let nextFrameId = 1;
    const originalRequestFrame = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    const originalCancelFrame = Object.getOwnPropertyDescriptor(
      window,
      "cancelAnimationFrame",
    );
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        const frameId = nextFrameId++;
        pendingFrames.set(frameId, callback);
        return frameId;
      },
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: (frameId: number) => {
        cancelledFrames.push(frameId);
        pendingFrames.delete(frameId);
      },
    });

    try {
      const { result } = setup({
        privateNotes: [
          buildNote({ id: "private-1", authorId: ME, visibility: "private" }),
          buildNote({ id: "private-2", authorId: ME, visibility: "private" }),
          buildNote({ id: "private-3", authorId: ME, visibility: "private" }),
        ],
        privateToolbarRef: toolbarRef,
      });
      const runNextFrame = () => {
        const next = pendingFrames.entries().next().value as
          | [number, FrameRequestCallback]
          | undefined;
        if (!next) throw new Error("自動スクロールのフレームがありません");
        const [frameId, callback] = next;
        pendingFrames.delete(frameId);
        act(() => callback(16));
      };

      act(() => {
        result.current.handlePrivateDragStart(
          "private-1",
          pointerEvent(1, 750, 180),
        );
        result.current.handlePointerMove(pointerEvent(1, 750, 490));
      });
      expect(result.current.drag?.status).toBe("private");

      runNextFrame();
      expect(scrollContainer.scrollTop).toBeGreaterThan(100);

      const scrollTopAfterDown = scrollContainer.scrollTop;
      act(() => {
        result.current.handlePointerMove(pointerEvent(1, 750, 110));
      });
      runNextFrame();
      expect(scrollContainer.scrollTop).toBeLessThan(scrollTopAfterDown);

      const pendingFrameId = pendingFrames.keys().next().value as
        | number
        | undefined;
      act(() => {
        result.current.handlePointerMove(pointerEvent(1, 500, 300));
      });
      if (pendingFrameId !== undefined) {
        expect(cancelledFrames).toContain(pendingFrameId);
      }
    } finally {
      if (originalRequestFrame) {
        Object.defineProperty(
          window,
          "requestAnimationFrame",
          originalRequestFrame,
        );
      } else {
        Reflect.deleteProperty(window, "requestAnimationFrame");
      }
      if (originalCancelFrame) {
        Object.defineProperty(
          window,
          "cancelAnimationFrame",
          originalCancelFrame,
        );
      } else {
        Reflect.deleteProperty(window, "cancelAnimationFrame");
      }
    }
  });

  it("固定マップのドラッグは重なったHUD上でもマップ座標を更新する", () => {
    const notePositionFromClient = vi.fn(() => ({ x: 40, y: 60 }));
    const { args, result } = setup({ notePositionFromClient });
    const overlay = document.createElement("div");
    overlay.innerHTML =
      "<div data-board-fit-edge><button>全体表示</button></div>";
    let pointerOverHud = false;
    const descriptor = Object.getOwnPropertyDescriptor(
      document,
      "elementFromPoint",
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => (pointerOverHud ? overlay.querySelector("button") : null),
    });

    try {
      act(() => {
        result.current.handleSharedNoteDragStart(
          "shared-1",
          pointerEvent(4, 100, 100),
        );
      });
      pointerOverHud = true;
      act(() => {
        result.current.handlePointerMove(pointerEvent(4, 300, 200));
      });

      expect(notePositionFromClient).toHaveBeenCalledWith(
        300,
        200,
        expect.objectContaining({ status: "shared" }),
      );
      expect(result.current.drag).toMatchObject({ x: 40, y: 60 });
      expect(args.onNoteDragMove).toHaveBeenCalledWith("shared-1", 40, 60);
    } finally {
      if (descriptor)
        Object.defineProperty(document, "elementFromPoint", descriptor);
      else Reflect.deleteProperty(document, "elementFromPoint");
    }
  });

  it("固定マップの共有付箋はHUD上で離しても最終ポインター位置を保存する", () => {
    const notePositionFromClient = vi.fn(() => ({ x: 40, y: 60 }));
    const { args, result } = setup({ notePositionFromClient });
    const overlay = document.createElement("div");
    overlay.innerHTML =
      "<div data-board-fit-edge><button>全体表示</button></div>";
    let pointerOverHud = false;
    const descriptor = Object.getOwnPropertyDescriptor(
      document,
      "elementFromPoint",
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => (pointerOverHud ? overlay.querySelector("button") : null),
    });

    try {
      act(() => {
        result.current.handleSharedNoteDragStart(
          "shared-1",
          pointerEvent(5, 100, 100),
        );
        result.current.handlePointerMove(pointerEvent(5, 300, 200));
      });
      pointerOverHud = true;
      notePositionFromClient.mockReturnValue({ x: 55, y: 65 });
      act(() => {
        result.current.handlePointerEnd(pointerEvent(5, 330, 200));
      });

      expect(args.onNoteDragEnd).toHaveBeenCalledWith("shared-1", 55, 65);
    } finally {
      if (descriptor)
        Object.defineProperty(document, "elementFromPoint", descriptor);
      else Reflect.deleteProperty(document, "elementFromPoint");
    }
  });

  it("マイ付箋エリアに重ねても共有付箋の移動を継続し取り消さない", () => {
    const { args, result } = setup();

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
      result.current.handlePointerMove(pointerEvent(1, 250, 180));
      result.current.handlePointerMove(pointerEvent(1, 400, 560));
    });

    expect(result.current.drag?.status).toBe("shared");
    expect(args.onNoteDragCancel).not.toHaveBeenCalled();

    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 300, 200));
    });

    expect(args.onNoteDragStart).toHaveBeenCalledTimes(1);
    expect(args.onNoteDragMove).toHaveBeenLastCalledWith("shared-1", 300, 200);
  });

  it("マイ付箋エリアを通ってから操作ボタン上で離しても、最終ポインター位置で確定する", () => {
    const { args, result } = setup();

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
      result.current.handlePointerMove(pointerEvent(1, 250, 180));
      result.current.handlePointerMove(pointerEvent(1, 400, 560));
      result.current.handlePointerMove(pointerEvent(1, 700, 550));
      result.current.handlePointerEnd(pointerEvent(1, 700, 550));
    });

    expect(args.onNoteDragCancel).not.toHaveBeenCalled();
    expect(args.onNoteDragEnd).toHaveBeenCalledWith("shared-1", 700, 550);
    expect(result.current.drag).toBeNull();
  });

  it.each([
    {
      position: "先頭",
      clientY: 100,
      dropIndex: 0,
      expected: ["private-3", "private-1", "private-2"],
    },
    {
      position: "付箋間",
      clientY: 250,
      dropIndex: 1,
      expected: ["private-1", "private-3", "private-2"],
    },
    {
      position: "末尾",
      clientY: 570,
      dropIndex: 2,
      expected: ["private-1", "private-2", "private-3"],
    },
  ])(
    "個人付箋を縦方向の$positionへドラッグすると付箋の上下中央で並べ替える",
    ({ clientY, dropIndex, expected }) => {
      const privateNotes = [
        buildNote({ id: "private-1", authorId: ME, visibility: "private" }),
        buildNote({ id: "private-2", authorId: ME, visibility: "private" }),
        buildNote({ id: "private-3", authorId: ME, visibility: "private" }),
      ];
      const toolbarRef = fakeToolbarWithNotes([
        { noteId: "private-1", top: 100, bottom: 244 },
        { noteId: "private-2", top: 256, bottom: 400 },
        { noteId: "private-3", top: 412, bottom: 556 },
      ]);
      const { result } = setup({
        privateNotes,
        privateToolbarRef: toolbarRef,
      });

      act(() => {
        result.current.handlePrivateDragStart(
          "private-3",
          pointerEvent(1, 750, 480),
        );
        // clientX は常に同じ値にし、横方向の矩形判定に依存しないことも検証する。
        result.current.handlePointerMove(pointerEvent(1, 750, clientY));
      });

      expect(result.current.drag?.status).toBe("private");
      expect(result.current.drag?.privateDropIndex).toBe(dropIndex);
      expect(
        result.current.renderedPrivateNotes.map((note) => note.id),
      ).toEqual(expected);
    },
  );

  it("共有付箋の移動が許可されていないステップではドラッグを開始しない", () => {
    const { args, result } = setup({ canMoveSharedNotes: false });

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
    });

    expect(result.current.drag).toBeNull();
    expect(args.onNoteDragStart).not.toHaveBeenCalled();
  });

  it("ドラッグ中に共有付箋の移動が禁止された場合は移動・確定を送信しない", () => {
    const { args, result, rerender } = setup();

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
    });
    args.canMoveSharedNotes = false;
    rerender();

    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 250, 180));
      result.current.handlePointerEnd(pointerEvent(1, 250, 180));
    });

    expect(args.onNoteDragMove).not.toHaveBeenCalled();
    expect(args.onNoteDragEnd).not.toHaveBeenCalled();
    // 開始済みの移動を残すと、次のドラッグが始められなくなる。
    expect(args.onNoteDragCancel).toHaveBeenCalledWith("shared-1");
    expect(result.current.drag).toBeNull();
  });

  it("shared 状態でポインターを離すと最終座標で onNoteDragEnd を呼び、状態を解放する", () => {
    const { args, result } = setup();

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
    });
    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 250, 180));
    });
    act(() => {
      result.current.handlePointerEnd(pointerEvent(1, 250, 180));
    });

    expect(args.onNoteDragEnd).toHaveBeenCalledWith("shared-1", 250, 180);
    expect(result.current.drag).toBeNull();
  });

  it("マップ上の共有付箋を移動できる", () => {
    const { args, result } = setup({
      notes: [
        buildNote({
          id: "shared-1",
          authorId: ME,
          x: 50,
          y: 50,
        }),
      ],
    });

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
      result.current.handlePointerMove(pointerEvent(1, 250, 180));
      result.current.handlePointerEnd(pointerEvent(1, 250, 180));
    });

    expect(args.onNoteDragEnd).toHaveBeenCalledWith("shared-1", 200, 130);
    expect(result.current.drag).toBeNull();
  });

  it("付箋を掴んだ位置を保ったまま移動・ドロップする", () => {
    const { args, result } = setup();

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 150, 140),
      );
    });
    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 250, 240));
    });
    act(() => {
      result.current.handlePointerEnd(pointerEvent(1, 250, 240));
    });

    expect(args.onNoteDragMove).toHaveBeenCalledWith("shared-1", 200, 200);
    expect(args.onNoteDragEnd).toHaveBeenCalledWith("shared-1", 200, 200);
  });

  it("キャンバス境界を越えた位置からのドラッグでも掴んだ位置を保つ", () => {
    const { args, result } = setup({
      notes: [
        buildNote({
          id: "shared-1",
          authorId: ME,
          x: CANVAS_COORDINATE_LIMIT,
          y: 100,
        }),
      ],
      worldPointFromClient: (clientX: number, clientY: number) => ({
        x:
          clientX === 100
            ? CANVAS_COORDINATE_LIMIT + 100
            : CANVAS_COORDINATE_LIMIT,
        y: clientY,
      }),
    });

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
    });
    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 200, 100));
    });

    expect(args.onNoteDragMove).toHaveBeenCalledWith(
      "shared-1",
      CANVAS_COORDINATE_LIMIT - 100,
      100,
    );
  });

  it("共有付箋を素早くマイ付箋上へドラッグしても押下位置を保って移動を続ける", () => {
    const { result } = setup();
    const event = pointerEvent(1, 250, 140);
    Object.defineProperty(event, "currentTarget", {
      value: {
        getBoundingClientRect: () => ({
          left: 100,
          top: 100,
          width: 200,
          height: 150,
        }),
      },
    });
    act(() =>
      result.current.handleSharedNoteDragStart("shared-1", event, {
        clientX: 150,
        clientY: 140,
      }),
    );
    act(() => result.current.handlePointerMove(pointerEvent(1, 400, 560)));
    expect(result.current.drag).toMatchObject({
      status: "shared",
      previewOffsetX: 50,
      previewOffsetY: 40,
    });
  });

  it("canPublish が false の場合、マイ付箋はボードへ出ずに一覧で止まり、ボード側にいる間だけ publishBlocked を立てる", () => {
    const { args, result } = setup({ canPublish: false });

    act(() => {
      result.current.handlePrivateDragStart(
        "private-1",
        pointerEvent(1, 400, 560),
      );
    });
    expect(result.current.publishBlocked).toBe(false);

    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 300, 200));
    });

    // プレビューはボードへ追従せず、掴んだ位置に留まる。
    expect(result.current.drag).toMatchObject({
      status: "private",
      clientX: 400,
      clientY: 560,
    });
    expect(result.current.publishBlocked).toBe(true);
    expect(args.onNoteDragMove).not.toHaveBeenCalled();

    // 一覧へ戻せば案内は消える。
    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 400, 560));
    });
    expect(result.current.publishBlocked).toBe(false);

    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 310, 210));
    });
    expect(result.current.publishBlocked).toBe(true);

    act(() => {
      result.current.handlePointerEnd(pointerEvent(1, 310, 210));
    });
    expect(args.onPrivateNotePublish).not.toHaveBeenCalled();
    expect(result.current.drag).toBeNull();
    expect(result.current.publishBlocked).toBe(false);
  });

  it("ドラッグ開始時に付箋内の掴んだ位置（オフセット）を保持し、相対位置を考慮して移動座標を計算する", () => {
    const { args, result } = setup();
    const event = pointerEvent(1, 120, 130);
    Object.defineProperty(event, "currentTarget", {
      value: {
        getBoundingClientRect: () => ({
          left: 100,
          top: 100,
          right: 300,
          bottom: 250,
          width: 200,
          height: 150,
        }),
      },
    });

    // x:120, y:130 で左上(100,100)の付箋を掴んだ場合、grabOffsetX = 20, grabOffsetY = 30
    act(() => {
      result.current.handleSharedNoteDragStart("shared-1", event);
    });

    // ポインターが (220, 230) へ動いた場合、付箋左上座標は (220 - 20 = 200, 230 - 30 = 200) になる
    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 220, 230));
    });

    expect(args.onNoteDragMove).toHaveBeenCalledWith("shared-1", 200, 200);
  });

  it("長文のマイ付箋は伸びた実高に対する掴み位置を共有後も保つ", () => {
    const content = "あ".repeat(500);
    const fontSize = 24;
    const height = getNoteHeight(content, fontSize);
    const { args, result } = setup({
      privateNotes: [
        buildNote({
          id: "private-1",
          authorId: ME,
          visibility: "private",
          content,
          fontSize,
        }),
      ],
    });
    const event = pointerEvent(1, 150, 100 + height / 2);
    Object.defineProperty(event, "currentTarget", {
      value: {
        getBoundingClientRect: () => ({
          left: 100,
          top: 100,
          right: 300,
          bottom: 100 + height,
          width: 200,
          height,
        }),
      },
    });

    act(() => result.current.handlePrivateDragStart("private-1", event));
    act(() => result.current.handlePointerMove(pointerEvent(1, 400, 300)));
    expect(args.onPrivateNotePublish).not.toHaveBeenCalled();
    act(() => result.current.handlePointerEnd(pointerEvent(1, 400, 300)));

    expect(args.onPrivateNotePublish).toHaveBeenCalledWith(
      "private-1",
      350,
      300 - height / 2,
    );
  });

  it.each([8, 180])(
    "マイ付箋の最初の移動が%ipxでも押下時の掴み位置で配置する",
    (distance) => {
      const { args, result } = setup();
      const event = pointerEvent(1, 650 - distance, 180);
      Object.defineProperty(event, "currentTarget", {
        value: {
          getBoundingClientRect: () => ({
            left: 600,
            top: 100,
            width: 200,
            height: 150,
          }),
        },
      });
      act(() =>
        result.current.handlePrivateDragStart("private-1", event, {
          clientX: 650,
          clientY: 180,
        }),
      );
      act(() => result.current.handlePointerEnd(pointerEvent(1, 300, 250)));
      expect(args.onPrivateNotePublish).toHaveBeenCalledWith(
        "private-1",
        250,
        170,
      );
    },
  );

  it("異なる pointerId のイベントは無視する（マルチタッチの混線防止）", () => {
    const { args, result } = setup();

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
    });
    act(() => {
      result.current.handlePointerMove(pointerEvent(2, 300, 200));
    });

    expect(args.onNoteDragMove).not.toHaveBeenCalled();
    expect(result.current.drag?.status).toBe("shared");
  });
});

it("候補外も共有付箋としてドラッグを開始する", () => {
  const { result, args } = setup({
    notes: [buildNote({ id: "excluded", excluded: true })],
  });
  act(() =>
    result.current.handleSharedNoteDragStart(
      "excluded",
      pointerEvent(1, 100, 100),
    ),
  );
  expect(args.onNoteDragStart).toHaveBeenCalledWith("excluded");
});

describe("move集合の入口", () => {
  it("選択集合を固定して渡し共有境界を跨がない", () => {
    const { args, result } = setup({
      selectedNoteIds: ["shared-1", "shared-2"],
      notes: [
        buildNote({ id: "shared-1", authorId: ME, x: 100, y: 100 }),
        buildNote({ id: "shared-2", authorId: ME, x: 160, y: 100 }),
      ],
    });
    act(() =>
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 120, 130),
      ),
    );
    expect(args.onNoteDragStart).toHaveBeenCalledWith("shared-1", [
      "shared-1",
      "shared-2",
    ]);
    act(() => result.current.handlePointerMove(pointerEvent(1, 400, 560)));
    act(() => result.current.handlePointerEnd(pointerEvent(1, 400, 560)));
    expect(args.onNoteDragEnd).toHaveBeenCalledWith("shared-1", 380, 530);
  });
  it("押下起点offsetを閾値開始後にも維持する", () => {
    const { args, result } = setup();
    act(() =>
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 150, 130),
        { clientX: 120, clientY: 130 },
      ),
    );
    act(() => result.current.handlePointerMove(pointerEvent(1, 150, 130)));
    expect(args.onNoteDragMove).toHaveBeenCalledWith("shared-1", 130, 100);
  });
});

describe("個人作業エリア内の並べ替え", () => {
  it("同じ行の左右の位置で挿入先を選び、エリア外へ出しても共有しない", () => {
    const toolbar = document.createElement("div");
    toolbar.dataset.presentation = "workspace";
    toolbar.dataset.expanded = "false";
    toolbar.getBoundingClientRect = () => new DOMRect(20, 400, 1000, 260);
    for (const [index, id] of [
      "private-1",
      "private-2",
      "private-3",
    ].entries()) {
      const card = document.createElement("div");
      card.dataset.testid = "note-card";
      card.dataset.noteId = id;
      card.getBoundingClientRect = () =>
        new DOMRect(40 + index * 212, 470, 200, 150);
      toolbar.append(card);
    }
    const { result, args } = setup({
      privateToolbarRef: { current: toolbar },
      keepPrivateDragInList: true,
      canPublish: false,
      privateNotes: ["private-1", "private-2", "private-3"].map((id) =>
        buildNote({ id, authorId: ME, visibility: "private" }),
      ),
    });
    act(() =>
      result.current.handlePrivateDragStart(
        "private-3",
        pointerEvent(1, 500, 500),
      ),
    );
    act(() => result.current.handlePointerMove(pointerEvent(1, 260, 500)));
    expect(result.current.renderedPrivateNotes.map((note) => note.id)).toEqual([
      "private-1",
      "private-3",
      "private-2",
    ]);
    act(() => result.current.handlePointerMove(pointerEvent(1, 100, 100)));
    act(() => result.current.handlePointerEnd(pointerEvent(1, 100, 100)));
    expect(args.onPrivateNotePublish).not.toHaveBeenCalled();
    expect(args.onNoteDragMove).not.toHaveBeenCalled();
    expect(result.current.drag).toBeNull();
  });
});

describe("共有付箋のドラッグは右側のマイ付箋エリアやHUDに邪魔されず移動を完了する", () => {
  it("共有付箋をマイ付箋エリアの上へドラッグしてもマイ付箋へ戻さず、そのまま座標移動を確定する", () => {
    const dock = document.createElement("div");
    dock.dataset.boardFitEdge = "bottom";
    const toolbar = document.createElement("div");
    toolbar.getBoundingClientRect = () => new DOMRect(600, 120, 200, 140);
    dock.append(toolbar);
    document.body.append(dock);
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn(() => toolbar);
    try {
      const { args, result } = setup({
        privateToolbarRef: { current: toolbar },
      });
      act(() =>
        result.current.handleSharedNoteDragStart(
          "shared-1",
          pointerEvent(1, 120, 130),
        ),
      );
      act(() => result.current.handlePointerMove(pointerEvent(1, 680, 180)));
      expect(result.current.drag?.status).toBe("shared");
      expect(result.current.renderedNotes.map((n) => n.id)).toEqual([
        "shared-1",
      ]);
      expect(args.onNoteDragMove).toHaveBeenLastCalledWith(
        "shared-1",
        660,
        150,
      );

      act(() => result.current.handlePointerEnd(pointerEvent(1, 700, 190)));
      expect(args.onNoteDragEnd).toHaveBeenCalledExactlyOnceWith(
        "shared-1",
        680,
        160,
      );
      expect(args.onNoteDragCancel).not.toHaveBeenCalled();
      expect(result.current.drag).toBeNull();
    } finally {
      document.elementFromPoint = originalElementFromPoint;
      dock.remove();
    }
  });

  it("共有付箋をHUD（data-board-fit-edge）の上へ素早くドラッグして離しても元の位置に戻らない", () => {
    const hud = document.createElement("div");
    hud.dataset.boardFitEdge = "top";
    document.body.append(hud);
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn(() => hud);
    try {
      const { args, result } = setup();
      act(() => {
        result.current.handleSharedNoteDragStart(
          "shared-1",
          pointerEvent(1, 120, 130),
        );
        result.current.handlePointerMove(pointerEvent(1, 720, 40));
        result.current.handlePointerEnd(pointerEvent(1, 720, 40));
      });
      expect(args.onNoteDragMove).toHaveBeenCalledWith("shared-1", 700, 10);
      expect(args.onNoteDragEnd).toHaveBeenCalledExactlyOnceWith(
        "shared-1",
        700,
        10,
      );
      expect(args.onNoteDragCancel).not.toHaveBeenCalled();
    } finally {
      document.elementFromPoint = originalElementFromPoint;
      hud.remove();
    }
  });
});
