import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { describe, expect, it, vi } from "vitest";
import { CANVAS_COORDINATE_LIMIT, getNoteHeight } from "@/contracts/board";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { useBoardDrag } from "./use-board-drag";

const ME = "11111111-1111-4111-8111-111111111111";

// jsdom は getBoundingClientRect が常に 0 を返すため、rect を持つ疑似要素を
// ref として注入する（hook はビューポートの矩形しか参照しない）。
function fakeElementRef(rect: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): RefObject<HTMLDivElement | null> {
  return {
    current: {
      getBoundingClientRect: () => rect,
      scrollLeft: 0,
      scrollTop: 0,
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    } as unknown as HTMLDivElement,
  };
}

function fakePrivateToolbarRef(rect: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): RefObject<HTMLDivElement | null> {
  return {
    current: {
      getBoundingClientRect: () => rect,
      querySelectorAll: () => [],
    } as unknown as HTMLDivElement,
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
    currentUserId: ME,
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
    onPrivateNoteUnpublish: vi.fn(),
    ...overrides,
  };
  const rendered = renderHook(() => useBoardDrag(args));
  return { args, ...rendered };
}

describe("useBoardDrag", () => {
  it.each([
    "private",
    "returning",
  ])("AT-016: %s preview中のpanel閉鎖は残るDOM/refでも取消する", async (kind) => {
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
    act(() => {
      if (kind === "private")
        result.current.handlePrivateDragStart(
          "private-1",
          pointerEvent(1, 400, 560),
        );
      else {
        result.current.handleSharedNoteDragStart(
          "shared-1",
          pointerEvent(1, 100, 100),
        );
        result.current.handlePointerMove(pointerEvent(1, 400, 560));
      }
    });
    await act(async () => {
      toolbar.dataset.expanded = "false";
      await Promise.resolve();
    });
    expect(result.current.drag).toBeNull();
    act(() =>
      result.current.handlePointerEnd(
        pointerEvent(
          1,
          kind === "private" ? 300 : 400,
          kind === "private" ? 200 : 560,
        ),
      ),
    );
    expect(args.onPrivateNotePublish).not.toHaveBeenCalled();
    expect(args.onPrivateNoteUnpublish).not.toHaveBeenCalled();
    expect(result.current.isPointerInPrivateDropArea(400, 560)).toBe(false);
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
  ] as const)("%s ドラッグ中に別の指で %s 付箋を掴んでも、最初の操作を最後まで保つ", (firstKind, secondKind) => {
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
  });

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

  it.each([
    "cancel",
    "outside",
    "roundtrip",
  ])("AT-015: %s はprivateを公開しない", (kind) => {
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
  });

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
    const { args, result } = setup({ lockPrivateMapDrag: true });

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
    const { args, result } = setup({ lockPrivateMapDrag: true });

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

  it("mapで共有付箋をprivate dockへ戻した後もpointerupまでlockを維持する", () => {
    const { args, result } = setup({ lockPrivateMapDrag: true });

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(14, 100, 100),
      );
      result.current.handlePointerMove(pointerEvent(14, 400, 560));
    });

    expect(args.onPrivateNoteUnpublish).not.toHaveBeenCalled();
    expect(args.onNoteDragCancel).not.toHaveBeenCalled();

    act(() => {
      result.current.handlePointerEnd(pointerEvent(14, 400, 560));
    });

    expect(args.onPrivateNoteUnpublish).toHaveBeenCalledWith(
      "shared-1",
      expect.any(Number),
      true,
    );
    expect(args.onNoteDragCancel).toHaveBeenCalledWith("shared-1");
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
    expect(args.onPrivateNoteUnpublish).not.toHaveBeenCalled();
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

  it("自分の共有付箋をツールバーへ重ねると確定せず returning になる", () => {
    const { args, result } = setup();

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
    });
    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 400, 560));
    });

    expect(args.onPrivateNoteUnpublish).not.toHaveBeenCalled();
    expect(result.current.drag?.status).toBe("returning");
    // RoomDO の応答を待たずに、カードを表示上ツールバー側へ移す。
    expect(
      result.current.renderedNotes.some((note) => note.id === "shared-1"),
    ).toBe(false);
    expect(
      result.current.renderedPrivateNotes.some(
        (note) => note.id === "shared-1" && note.visibility === "private",
      ),
    ).toBe(true);
  });

  it.each([
    { side: "上", clientX: 700, clientY: 100 },
    { side: "下", clientX: 700, clientY: 425 },
    { side: "右", clientX: 750, clientY: 300 },
  ])("付箋本体がマイ付箋エリアの$side側に重なる場合は戻せる", ({
    clientX,
    clientY,
  }) => {
    const { args, result } = setup({
      privateToolbarRef: fakePrivateToolbarRef({
        left: 600,
        top: 200,
        right: 700,
        bottom: 400,
      }),
    });
    const startEvent = pointerEvent(1, 250, 250);
    Object.defineProperty(startEvent, "currentTarget", {
      value: {
        getBoundingClientRect: () => ({
          left: 170,
          top: 220,
          right: 362,
          bottom: 364,
          width: 192,
          height: 144,
        }),
      },
    });

    act(() => {
      result.current.handleSharedNoteDragStart("shared-1", startEvent);
      result.current.handlePointerMove(pointerEvent(1, clientX, clientY));
    });

    expect(result.current.drag?.status).toBe("returning");

    act(() => {
      result.current.handlePointerEnd(pointerEvent(1, clientX, clientY));
    });

    expect(args.onPrivateNoteUnpublish).toHaveBeenCalledWith(
      "shared-1",
      expect.any(Number),
    );
    expect(args.onNoteDragEnd).not.toHaveBeenCalled();
  });

  it("マイ付箋エリアの左側は認識範囲を広げない", () => {
    const { result } = setup({
      privateToolbarRef: fakePrivateToolbarRef({
        left: 600,
        top: 200,
        right: 700,
        bottom: 400,
      }),
    });
    const startEvent = pointerEvent(1, 250, 250);
    Object.defineProperty(startEvent, "currentTarget", {
      value: {
        getBoundingClientRect: () => ({
          left: 170,
          top: 220,
          right: 362,
          bottom: 364,
          width: 192,
          height: 144,
        }),
      },
    });

    act(() => {
      result.current.handleSharedNoteDragStart("shared-1", startEvent);
      result.current.handlePointerMove(pointerEvent(1, 590, 300));
    });

    expect(result.current.drag?.status).toBe("shared");
  });

  it("マイ付箋エリアへ入った後も上下移動に合わせて挿入位置を更新する", () => {
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
    const { args, result } = setup({
      privateNotes,
      privateToolbarRef: toolbarRef,
    });

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
      result.current.handlePointerMove(pointerEvent(1, 750, 120));
    });
    expect(result.current.drag?.status).toBe("returning");
    expect(result.current.drag?.privateDropIndex).toBe(0);

    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 760, 350));
    });

    expect(result.current.drag?.status).toBe("returning");
    expect(result.current.drag?.clientX).toBe(760);
    expect(result.current.drag?.clientY).toBe(350);
    expect(result.current.drag?.privateDropIndex).toBe(2);
    expect(args.onPrivateNoteUnpublish).not.toHaveBeenCalled();
  });

  it("戻すドラッグ中にリストの上下端へ近づくと自動スクロールする", () => {
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
      const { result } = setup({ privateToolbarRef: toolbarRef });
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
        result.current.handleSharedNoteDragStart(
          "shared-1",
          pointerEvent(1, 100, 100),
        );
        result.current.handlePointerMove(pointerEvent(1, 750, 490));
      });
      expect(result.current.drag?.status).toBe("returning");
      expect(result.current.drag?.privateDropIndex).toBe(2);

      runNextFrame();

      expect(scrollContainer.scrollTop).toBeGreaterThan(100);
      expect(result.current.drag?.privateDropIndex).toBe(3);

      act(() => {
        result.current.handlePointerMove(pointerEvent(1, 750, 110));
      });
      runNextFrame();
      expect(scrollContainer.scrollTop).toBeLessThan(107);

      const scrollTopBeforeUpperExtendedZone = scrollContainer.scrollTop;
      act(() => {
        result.current.handlePointerMove(pointerEvent(1, 750, 90));
      });
      runNextFrame();
      expect(scrollContainer.scrollTop).toBeLessThan(
        scrollTopBeforeUpperExtendedZone,
      );
      const scrollTopNearUpperEdge = scrollContainer.scrollTop;
      const upperEdgeScrollDelta =
        scrollTopBeforeUpperExtendedZone - scrollTopNearUpperEdge;
      act(() => {
        result.current.handlePointerMove(pointerEvent(1, 750, 70));
      });
      runNextFrame();
      const upperFartherScrollDelta =
        scrollTopNearUpperEdge - scrollContainer.scrollTop;
      expect(upperFartherScrollDelta).toBeGreaterThan(upperEdgeScrollDelta);

      const scrollTopBeforeLowerExtendedZone = scrollContainer.scrollTop;
      act(() => {
        result.current.handlePointerMove(pointerEvent(1, 750, 510));
      });
      runNextFrame();
      expect(scrollContainer.scrollTop).toBeGreaterThan(
        scrollTopBeforeLowerExtendedZone,
      );
      const scrollTopNearLowerEdge = scrollContainer.scrollTop;
      const lowerEdgeScrollDelta =
        scrollTopNearLowerEdge - scrollTopBeforeLowerExtendedZone;
      act(() => {
        result.current.handlePointerMove(pointerEvent(1, 750, 530));
      });
      runNextFrame();
      const lowerFartherScrollDelta =
        scrollContainer.scrollTop - scrollTopNearLowerEdge;
      expect(lowerFartherScrollDelta).toBeGreaterThan(lowerEdgeScrollDelta);

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

  it("returning をドロップした時だけ挿入位置付きで unpublish する", () => {
    const toolbarRef = fakeToolbarWithNotes([
      { noteId: "private-1", top: 100, bottom: 244 },
    ]);
    const { args, result, rerender } = setup({ privateToolbarRef: toolbarRef });

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
      result.current.handlePointerMove(pointerEvent(1, 750, 120));
    });
    expect(args.onPrivateNoteUnpublish).not.toHaveBeenCalled();

    act(() => {
      result.current.handlePointerEnd(pointerEvent(1, 750, 120));
    });

    expect(args.onPrivateNoteUnpublish).toHaveBeenCalledWith("shared-1", 0);
    expect(
      result.current.renderedNotes.some((note) => note.id === "shared-1"),
    ).toBe(true);

    // RoomDO の確定後も、ボードから消えたままマイ付箋に表示される。
    args.notes = [];
    args.privateNotes = [
      ...args.privateNotes,
      buildNote({ id: "shared-1", authorId: ME, visibility: "private" }),
    ];
    rerender();

    expect(result.current.renderedNotes.map((note) => note.id)).not.toContain(
      "shared-1",
    );
    expect(
      result.current.renderedPrivateNotes.map((note) => note.id),
    ).toContain("shared-1");
  });

  it("マイ付箋エリアの外で離した returning は非公開へ戻さない", () => {
    const { args, result } = setup();

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
      result.current.handlePointerMove(pointerEvent(1, 400, 560));
      // ボードとマイ付箋の間にあるヘッダー領域へ移動する。
      result.current.handlePointerMove(pointerEvent(1, 700, 550));
      result.current.handlePointerEnd(pointerEvent(1, 700, 550));
    });

    expect(args.onPrivateNoteUnpublish).not.toHaveBeenCalled();
    expect(result.current.drag).toBeNull();
    expect(result.current.renderedNotes.map((note) => note.id)).toContain(
      "shared-1",
    );
  });

  it("map lock 中に戻し先候補から外れて離したら保持中のlockを解除する", () => {
    const { args, result } = setup({ lockPrivateMapDrag: true });

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(15, 100, 100),
      );
      result.current.handlePointerMove(pointerEvent(15, 400, 560));
      result.current.handlePointerMove(pointerEvent(15, 700, 550));
    });

    expect(args.onPrivateNoteUnpublish).not.toHaveBeenCalled();
    expect(args.onNoteDragCancel).not.toHaveBeenCalled();

    act(() => {
      result.current.handlePointerEnd(pointerEvent(15, 700, 550));
    });

    expect(args.onPrivateNoteUnpublish).not.toHaveBeenCalled();
    expect(args.onNoteDragCancel).toHaveBeenCalledWith("shared-1");
    expect(result.current.drag).toBeNull();
  });

  it("returning をキャンセルすると unpublish せず共有付箋を元の領域へ戻す", () => {
    const { args, result } = setup();

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
      result.current.handlePointerMove(pointerEvent(1, 400, 560));
      result.current.handlePointerCancel(pointerEvent(1, 400, 560));
    });

    expect(args.onPrivateNoteUnpublish).not.toHaveBeenCalled();
    expect(result.current.renderedNotes.map((note) => note.id)).toContain(
      "shared-1",
    );
    expect(
      result.current.renderedPrivateNotes.map((note) => note.id),
    ).not.toContain("shared-1");
  });

  it("共有付箋をマイ付箋へ戻す位置に応じて末尾へ挿入する", () => {
    const existing = [
      buildNote({ id: "private-1", authorId: ME, visibility: "private" }),
      buildNote({ id: "private-2", authorId: ME, visibility: "private" }),
    ];
    const { args, result, rerender } = setup({ privateNotes: existing });

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
      result.current.handlePointerMove(pointerEvent(1, 580, 589));
      result.current.handlePointerEnd(pointerEvent(1, 580, 589));
    });

    expect(args.onPrivateNoteUnpublish).toHaveBeenCalledWith("shared-1", 2);
    expect(result.current.renderedPrivateNotes.map((note) => note.id)).toEqual([
      "private-1",
      "private-2",
    ]);

    args.privateNotes = [
      ...existing,
      buildNote({ id: "shared-1", authorId: ME, visibility: "private" }),
    ];
    rerender();
    expect(result.current.renderedPrivateNotes.map((note) => note.id)).toEqual([
      "private-1",
      "private-2",
      "shared-1",
    ]);
  });

  it.each([
    {
      position: "先頭",
      clientY: 100,
      dropIndex: 0,
      expected: ["shared-1", "private-1", "private-2", "private-3"],
    },
    {
      position: "付箋間",
      clientY: 250,
      dropIndex: 1,
      expected: ["private-1", "shared-1", "private-2", "private-3"],
    },
    {
      position: "末尾",
      clientY: 570,
      dropIndex: 3,
      expected: ["private-1", "private-2", "private-3", "shared-1"],
    },
  ])("縦方向の$positionへドロップすると付箋の上下中央で挿入する", ({
    clientY,
    dropIndex,
    expected,
  }) => {
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
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
      // clientX は常に同じ値にし、横方向の矩形判定に依存しないことも検証する。
      result.current.handlePointerMove(pointerEvent(1, 750, clientY));
    });

    expect(result.current.drag?.status).toBe("returning");
    expect(result.current.drag?.privateDropIndex).toBe(dropIndex);
    expect(result.current.renderedPrivateNotes.map((note) => note.id)).toEqual(
      expected,
    );
  });

  it("他人の共有付箋はツールバーに重ねても unpublish しない", () => {
    const { args, result } = setup({
      notes: [
        buildNote({ id: "shared-1", authorId: "someone-else", x: 100, y: 100 }),
      ],
    });

    act(() => {
      result.current.handleSharedNoteDragStart(
        "shared-1",
        pointerEvent(1, 100, 100),
      );
    });
    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 400, 560));
    });

    expect(args.onPrivateNoteUnpublish).not.toHaveBeenCalled();
  });

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

  it("canPublish が false の場合、マイ付箋をボードへ運ぶと onPublishBlocked を1回だけ呼び通信を遮断する", () => {
    const onPublishBlocked = vi.fn();
    const { args, result } = setup({ canPublish: false, onPublishBlocked });

    act(() => {
      result.current.handlePrivateDragStart(
        "private-1",
        pointerEvent(1, 400, 560),
      );
    });

    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 300, 200));
    });

    expect(onPublishBlocked).toHaveBeenCalledTimes(1);
    expect(args.onPrivateNotePublish).not.toHaveBeenCalled();

    // 2回目 pointerMove
    act(() => {
      result.current.handlePointerMove(pointerEvent(1, 310, 210));
    });

    expect(onPublishBlocked).toHaveBeenCalledTimes(1);
    expect(args.onNoteDragMove).not.toHaveBeenCalled();
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
    expect(args.onNoteDragStart).toHaveBeenCalledWith("shared-1", false, [
      "shared-1",
      "shared-2",
    ]);
    act(() => result.current.handlePointerMove(pointerEvent(1, 400, 560)));
    act(() => result.current.handlePointerEnd(pointerEvent(1, 400, 560)));
    expect(args.onPrivateNoteUnpublish).not.toHaveBeenCalled();
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
