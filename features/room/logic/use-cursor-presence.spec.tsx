import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { RoomScreenConnectionStatus } from "./connection-status";
import { useCursorPresence } from "./use-cursor-presence";

const ME = "11111111-1111-4111-8111-111111111111";

describe("useCursorPresence", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("位置を即時送信し、短時間の連続更新は末尾へ coalesce する", () => {
    const send = vi.fn();
    const { result } = renderHook(() =>
      useCursorPresence({
        currentUserId: ME,
        phase: buildPhaseStep(2),
        connectionStatus: "open",
        send,
      }),
    );

    act(() => {
      result.current.updateCursor({ x: 10, y: 20 }, null);
      result.current.updateCursor({ x: 30, y: 40 }, null);
      result.current.updateCursor({ x: 50, y: 60 }, null);
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith({
      type: "cursor:update",
      x: 10,
      y: 20,
      draggingNoteId: null,
    });

    act(() => vi.advanceTimersByTime(80));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({
      type: "cursor:update",
      x: 50,
      y: 60,
      draggingNoteId: null,
    });
  });

  it("非表示にすると leave を送り、その後の位置を送らない", () => {
    const send = vi.fn();
    const { result } = renderHook(() =>
      useCursorPresence({
        currentUserId: ME,
        phase: buildPhaseStep(2),
        connectionStatus: "open",
        send,
      }),
    );
    act(() => result.current.updateCursor({ x: 10, y: 20 }, null));
    act(() => result.current.toggleCursors());
    act(() => result.current.updateCursor({ x: 30, y: 40 }, null));

    expect(send).toHaveBeenLastCalledWith({ type: "cursor:leave" });
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.current.areCursorsVisible).toBe(false);
  });

  it("切断時は受信済みカーソルを消す", () => {
    const send = vi.fn();
    const { result, rerender } = renderHook(
      ({
        connectionStatus,
      }: {
        connectionStatus: RoomScreenConnectionStatus;
      }) =>
        useCursorPresence({
          currentUserId: ME,
          phase: buildPhaseStep(2),
          connectionStatus,
          send,
        }),
      {
        initialProps: {
          connectionStatus: "open",
        } as { connectionStatus: RoomScreenConnectionStatus },
      },
    );
    act(() =>
      result.current.applyMessage({
        type: "cursor:updated",
        cursor: {
          userId: "22222222-2222-4222-8222-222222222222",
          name: "Taro",
          color: "green",
          x: 10,
          y: 20,
          draggingNoteId: null,
        },
      }),
    );
    expect(result.current.remoteCursors).toHaveLength(1);

    rerender({ connectionStatus: "closed" });
    expect(result.current.remoteCursors).toEqual([]);
  });
});
