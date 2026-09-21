import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { describe, expect, it, vi } from "vitest";
import { CANVAS_COORDINATE_LIMIT } from "@/contracts/board";
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

function fakeToolbarWithNotes(
  noteRects: Array<{
    noteId: string;
    top: number;
    bottom: number;
  }>,
): RefObject<HTMLDivElement | null> {
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
          getBoundingClientRect: () => ({
            left: 600,
            right: 800,
            top,
            bottom,
            height: bottom - top,
          }),
        })),
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

  it("マイ付箋をボードへ運ぶと publish → drag 配信の順で共有化する", () => {
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

    expect(args.onPrivateNotePublish).toHaveBeenCalledWith(
      "private-1",
      300,
      200,
    );
    expect(args.onNoteDragStart).toHaveBeenCalledWith("private-1");
    expect(args.onNoteDragMove).toHaveBeenCalledWith("private-1", 300, 200);
    expect(result.current.drag?.status).toBe("shared");
  });

  it("canPublish private drag はpointerdown時にlockを取りdock内pointerupで解除する", () => {
    const { args, result } = setup({ lockPrivateMapDrag: true });

    act(() => {
      result.current.handlePrivateDragStart(
        "private-1",
        pointerEvent(12, 400, 560),
      );
    });
    expect(args.onNoteDragStart).toHaveBeenCalledWith("private-1", true);

    act(() => {
      result.current.handlePointerEnd(pointerEvent(12, 400, 560));
    });
    expect(args.onNoteDragCancel).toHaveBeenCalledWith("private-1");
    expect(args.onPrivateNotePublish).not.toHaveBeenCalled();
  });

  it("private map drag のpointercancelでRoomDO lockを解除する", () => {
    const { args, result } = setup({ lockPrivateMapDrag: true });

    act(() => {
      result.current.handlePrivateDragStart(
        "private-1",
        pointerEvent(13, 400, 560),
      );
      result.current.handlePointerCancel(pointerEvent(13, 700, 200));
    });

    expect(args.onNoteDragStart).toHaveBeenCalledWith("private-1", true);
    expect(args.onNoteDragCancel).toHaveBeenCalledWith("private-1");
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
      result.current.handlePointerEnd(pointerEvent(14, 400, 560));
    });

    expect(args.onPrivateNoteUnpublish).toHaveBeenCalledWith("shared-1", true);
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
    expect(args.onNoteDragEnd).toHaveBeenCalledWith("private-1", 50, 50);
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

  it("自分の共有付箋をツールバーへ戻すと unpublish して returning になる", () => {
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

    expect(args.onPrivateNoteUnpublish).toHaveBeenCalledWith("shared-1");
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

    expect(result.current.renderedPrivateNotes.map((note) => note.id)).toEqual([
      "private-1",
      "private-2",
      "shared-1",
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
