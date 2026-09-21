import { act, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RoomPhase } from "@/contracts/phase";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { useRoomBoardInteractions } from "./use-room-board-interactions";

function setup({
  phase = buildPhaseStep(2),
  withSharedDrag = false,
  withPrivateNote = false,
  ideaMapSizeLevel = 0,
  ideaMapSizeInitialized = true,
}: {
  phase?: RoomPhase;
  withSharedDrag?: boolean;
  withPrivateNote?: boolean;
  ideaMapSizeLevel?: number;
  ideaMapSizeInitialized?: boolean;
} = {}) {
  const onCursorMove = vi.fn();
  const onCursorLeave = vi.fn();
  const onNoteDragCancel = vi.fn();
  const onNoteDragStart = vi.fn();
  const onPrivateNoteUnpublish = vi.fn();
  const notes = withSharedDrag
    ? [
        buildNote({
          id: "shared-1",
          authorId: "11111111-1111-4111-8111-111111111111",
          x: 100,
          y: 100,
        }),
      ]
    : [];
  const { result } = renderHook(() =>
    useRoomBoardInteractions({
      notes,
      privateNotes: withPrivateNote
        ? [buildNote({ id: "private-1", visibility: "private" })]
        : [],
      currentUserId: "11111111-1111-4111-8111-111111111111",
      draggingNoteId: null,
      phase,
      ideaMapSizeLevel,
      ideaMapSizeInitialized,
      onNoteDragStart,
      onNoteDragMove: vi.fn(),
      onNoteDragEnd: vi.fn(),
      onNoteDragCancel,
      onPrivateNotePublish: vi.fn(),
      onPrivateNoteUnpublish,
      onCursorMove,
      onCursorLeave,
    }),
  );
  const viewport = document.createElement("div");
  viewport.getBoundingClientRect = () => new DOMRect(10, 20, 800, 600);
  result.current.boardScrollerRef.current = viewport;
  return {
    result,
    onCursorMove,
    onCursorLeave,
    onNoteDragCancel,
    onNoteDragStart,
    onPrivateNoteUnpublish,
    viewport,
  };
}

describe("useRoomBoardInteractions cursor input", () => {
  it("共有キャンバスの client 座標を board 座標へ変換する", () => {
    const { result, onCursorMove, viewport } = setup();
    act(() =>
      result.current.onPresencePointerMove({
        clientX: 50,
        clientY: 60,
        pointerType: "mouse",
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>),
    );
    expect(onCursorMove).toHaveBeenCalledWith({ x: 40, y: 40 }, null);
  });

  it("パン・ズーム後も client 座標を同じ board 座標系へ変換する", () => {
    const { result, onCursorMove, viewport } = setup();
    act(() => {
      result.current.onCanvasPointerDown({
        button: 0,
        clientX: 100,
        clientY: 100,
        currentTarget: viewport,
        pointerId: 1,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>);
      result.current.onCanvasPointerMove({
        clientX: 150,
        clientY: 120,
        currentTarget: viewport,
        pointerId: 1,
      } as unknown as PointerEvent<HTMLDivElement>);
      result.current.onZoomIn();
      result.current.onPresencePointerMove({
        clientX: 60,
        clientY: 60,
        pointerType: "mouse",
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onCursorMove).toHaveBeenCalledWith({ x: 70, y: 72 }, null);
  });

  it("2軸マップでは左下を原点にした百分率へ変換する", () => {
    const { result, onCursorMove } = setup({ phase: buildPhaseStep(2, 3) });
    const plane = document.createElement("div");
    plane.getBoundingClientRect = () => new DOMRect(100, 200, 400, 200);
    result.current.ideaMapPlaneRef.current = plane;

    act(() =>
      result.current.onPresencePointerMove({
        clientX: 300,
        clientY: 250,
        pointerType: "mouse",
        target: plane,
      } as unknown as PointerEvent<HTMLDivElement>),
    );

    expect(onCursorMove).toHaveBeenCalledWith({ x: 50, y: 75 }, null);
  });

  it("全体表示操作で共有された2軸マップ寸法を使う", () => {
    const { result, viewport } = setup({
      phase: buildPhaseStep(2, 3),
      ideaMapSizeLevel: 1,
      ideaMapSizeInitialized: true,
    });
    result.current.boardScrollerRef.current = viewport;

    act(() => result.current.onFitToNotes());

    expect(result.current.camera.zoom).toBeCloseTo(672 / 1920);
  });

  it("3-2では公開可能なprivate付箋のpointerdownから先にdrag lockを要求する", () => {
    const { result, onNoteDragStart } = setup({
      phase: buildPhaseStep(2, 3),
      withPrivateNote: true,
    });

    act(() =>
      result.current.onPrivateNoteDragStart("private-1", {
        pointerId: 15,
        clientX: 700,
        clientY: 560,
        currentTarget: {
          getBoundingClientRect: () => ({
            left: 600,
            top: 500,
            right: 800,
            bottom: 650,
            width: 200,
            height: 150,
          }),
        },
      } as unknown as PointerEvent<HTMLButtonElement>),
    );

    expect(onNoteDragStart).toHaveBeenCalledWith("private-1", true);
  });

  it("入力欄と touch の位置は送信せず、キャンバス退出を通知する", () => {
    const { result, onCursorMove, onCursorLeave } = setup();
    const input = document.createElement("textarea");
    act(() =>
      result.current.onPresencePointerMove({
        clientX: 50,
        clientY: 60,
        pointerType: "mouse",
        target: input,
      } as unknown as PointerEvent<HTMLDivElement>),
    );
    act(() =>
      result.current.onPresencePointerMove({
        clientX: 50,
        clientY: 60,
        pointerType: "touch",
        target: document.createElement("div"),
      } as unknown as PointerEvent<HTMLDivElement>),
    );
    expect(onCursorMove).not.toHaveBeenCalled();
    expect(onCursorLeave).toHaveBeenCalledTimes(2);
  });

  it("data-cursor-private 配下の個人UI位置は送信しない", () => {
    const { result, onCursorMove, onCursorLeave } = setup();
    const privateArea = document.createElement("div");
    privateArea.dataset.cursorPrivate = "true";
    const child = document.createElement("button");
    privateArea.append(child);

    act(() =>
      result.current.onPresencePointerMove({
        clientX: 50,
        clientY: 60,
        pointerType: "mouse",
        target: child,
      } as unknown as PointerEvent<HTMLDivElement>),
    );

    expect(onCursorMove).not.toHaveBeenCalled();
    expect(onCursorLeave).toHaveBeenCalledOnce();
  });

  it("pointer end では操作対象を null にして解除する", () => {
    const { result, onCursorMove, viewport } = setup();
    act(() =>
      result.current.onPointerEnd({
        pointerId: 1,
        clientX: 50,
        clientY: 60,
        pointerType: "mouse",
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>),
    );
    expect(onCursorMove).toHaveBeenLastCalledWith({ x: 40, y: 40 }, null);
  });

  it("shared drag 中に private toolbar へ入る presence leave は unpublish より先に操作権もカーソルも解除しない", () => {
    const { result, onCursorLeave, onNoteDragCancel, onPrivateNoteUnpublish } =
      setup({
        withSharedDrag: true,
      });
    const toolbar = document.createElement("div");
    toolbar.getBoundingClientRect = () => new DOMRect(600, 0, 300, 600);
    result.current.privateToolbarRef.current = toolbar;
    act(() => {
      result.current.onNoteDragStart("shared-1", {
        pointerId: 7,
        clientX: 120,
        clientY: 130,
      } as unknown as PointerEvent<HTMLButtonElement>);
      result.current.onPresencePointerLeave({
        pointerId: 7,
        clientX: 650,
        clientY: 120,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onNoteDragCancel).not.toHaveBeenCalled();
    expect(onCursorLeave).not.toHaveBeenCalled();
    expect(onPrivateNoteUnpublish).not.toHaveBeenCalled();
    expect(result.current.isNoteDragging).toBe(true);

    act(() => {
      result.current.onPointerMove({
        pointerId: 7,
        clientX: 650,
        clientY: 120,
      } as unknown as PointerEvent<HTMLDivElement>);
      result.current.onPresencePointerMove({
        pointerId: 7,
        clientX: 650,
        clientY: 120,
        pointerType: "mouse",
        target: toolbar,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onPrivateNoteUnpublish).toHaveBeenCalledWith("shared-1");
    expect(onPrivateNoteUnpublish.mock.invocationCallOrder[0]).toBeLessThan(
      onCursorLeave.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("shared drag 中に toolbar 以外へ出る presence leave は付箋操作とカーソルを同時に解除する", () => {
    const { result, onCursorLeave, onNoteDragCancel } = setup({
      withSharedDrag: true,
    });
    act(() => {
      result.current.onNoteDragStart("shared-1", {
        pointerId: 7,
        clientX: 120,
        clientY: 130,
      } as unknown as PointerEvent<HTMLButtonElement>);
      result.current.onPresencePointerLeave({
        pointerId: 7,
        clientX: 950,
        clientY: 700,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onCursorLeave).toHaveBeenCalledOnce();
    expect(onNoteDragCancel).toHaveBeenCalledWith("shared-1");
    expect(result.current.isNoteDragging).toBe(false);
  });

  it("shared drag 中は別 pointer の presence move と leave を無視する", () => {
    const { result, onCursorMove, onCursorLeave, onNoteDragCancel, viewport } =
      setup({ withSharedDrag: true });
    act(() => {
      result.current.onNoteDragStart("shared-1", {
        pointerId: 7,
        clientX: 120,
        clientY: 130,
      } as unknown as PointerEvent<HTMLButtonElement>);
      result.current.onPresencePointerMove({
        pointerId: 8,
        pointerType: "mouse",
        clientX: 50,
        clientY: 60,
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>);
      result.current.onPresencePointerLeave({
        pointerId: 8,
        clientX: 950,
        clientY: 700,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onCursorMove).not.toHaveBeenCalled();
    expect(onCursorLeave).not.toHaveBeenCalled();
    expect(onNoteDragCancel).not.toHaveBeenCalled();
    expect(result.current.isNoteDragging).toBe(true);
  });

  it("pointercancel は private toolbar 上でも shared drag を解除する", () => {
    const { result, onCursorLeave, onNoteDragCancel } = setup({
      withSharedDrag: true,
    });
    const toolbar = document.createElement("div");
    toolbar.getBoundingClientRect = () => new DOMRect(600, 0, 300, 600);
    result.current.privateToolbarRef.current = toolbar;
    act(() => {
      result.current.onNoteDragStart("shared-1", {
        pointerId: 7,
        clientX: 120,
        clientY: 130,
      } as unknown as PointerEvent<HTMLButtonElement>);
      result.current.onPresencePointerLeave({
        type: "pointercancel",
        pointerId: 7,
        clientX: 650,
        clientY: 120,
      } as unknown as PointerEvent<HTMLDivElement>);
      result.current.onPointerCancel({
        pointerId: 7,
        clientX: 650,
        clientY: 120,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onCursorLeave).toHaveBeenCalledOnce();
    expect(onNoteDragCancel).toHaveBeenCalledWith("shared-1");
    expect(result.current.isNoteDragging).toBe(false);
  });

  it("shared drag 中の境界外 pointermove はカーソルだけ解除し、真の leave までドラッグを維持する", () => {
    const { result, onCursorLeave, onNoteDragCancel, viewport } = setup({
      withSharedDrag: true,
    });
    act(() => {
      result.current.onNoteDragStart("shared-1", {
        pointerId: 9,
        clientX: 120,
        clientY: 130,
      } as unknown as PointerEvent<HTMLButtonElement>);
      result.current.onPresencePointerMove({
        pointerId: 9,
        pointerType: "mouse",
        clientX: 900,
        clientY: 700,
        target: viewport,
      } as unknown as PointerEvent<HTMLDivElement>);
    });

    expect(onNoteDragCancel).not.toHaveBeenCalled();
    expect(onCursorLeave).toHaveBeenCalledOnce();
    expect(result.current.isNoteDragging).toBe(true);
  });
});
