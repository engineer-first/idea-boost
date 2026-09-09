import { act, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RoomPhase } from "@/contracts/phase";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { useRoomBoardInteractions } from "./use-room-board-interactions";

function setup({ phase = buildPhaseStep(2) }: { phase?: RoomPhase } = {}) {
  const onCursorMove = vi.fn();
  const onCursorLeave = vi.fn();
  const { result } = renderHook(() =>
    useRoomBoardInteractions({
      notes: [],
      privateNotes: [],
      currentUserId: "11111111-1111-4111-8111-111111111111",
      draggingNoteId: null,
      phase,
      onNoteDragStart: vi.fn(),
      onNoteDragMove: vi.fn(),
      onNoteDragEnd: vi.fn(),
      onPrivateNotePublish: vi.fn(),
      onPrivateNoteUnpublish: vi.fn(),
      onCursorMove,
      onCursorLeave,
    }),
  );
  const viewport = document.createElement("div");
  viewport.getBoundingClientRect = () => new DOMRect(10, 20, 800, 600);
  result.current.boardScrollerRef.current = viewport;
  return { result, onCursorMove, onCursorLeave, viewport };
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
});
