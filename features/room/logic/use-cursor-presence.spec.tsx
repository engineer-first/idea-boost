import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { Suspense, startTransition } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { ClientMessage } from "@/contracts/room-protocol";
import type { RoomScreenConnectionStatus } from "./connection-status";
import { useCursorPresence } from "./use-cursor-presence";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NEVER_RESOLVES = new Promise<never>(() => {});

function CursorSender({
  connectionStatus,
  send,
}: {
  connectionStatus: RoomScreenConnectionStatus;
  send: (message: ClientMessage) => void;
}) {
  const cursorPresence = useCursorPresence({
    currentUserId: ME,
    phase: buildPhaseStep(2),
    connectionStatus,
    send,
  });
  if (connectionStatus === "closed") throw NEVER_RESOLVES;
  return (
    <button
      type="button"
      onClick={() => cursorPresence.updateCursor({ x: 10, y: 20 }, null)}
    >
      カーソルを送る
    </button>
  );
}

describe("useCursorPresence", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

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

  it("リモートカーソルが共有可能な間だけアイドル監視を動かす", () => {
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const clearInterval = vi.spyOn(globalThis, "clearInterval");
    const send = vi.fn();
    const { result, rerender } = renderHook(
      ({ step }: { step: number }) =>
        useCursorPresence({
          currentUserId: ME,
          phase: buildPhaseStep(step),
          connectionStatus: "open",
          send,
        }),
      { initialProps: { step: 2 } },
    );

    expect(setInterval).not.toHaveBeenCalled();
    act(() =>
      result.current.applyMessage({
        type: "cursor:updated",
        cursor: {
          userId: OTHER,
          name: "Taro",
          color: "green",
          x: 10,
          y: 20,
          draggingNoteId: null,
        },
      }),
    );
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1_000);

    rerender({ step: 4 });
    expect(clearInterval).toHaveBeenCalled();
  });

  it("破棄されたレンダーの接続状態で送信可否を変えない", () => {
    const send = vi.fn();
    const { rerender } = render(
      <Suspense fallback={<p>接続を更新中</p>}>
        <CursorSender connectionStatus="open" send={send} />
      </Suspense>,
    );

    act(() => {
      startTransition(() => {
        rerender(
          <Suspense fallback={<p>接続を更新中</p>}>
            <CursorSender connectionStatus="closed" send={send} />
          </Suspense>,
        );
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "カーソルを送る" }));

    expect(send).toHaveBeenCalledWith({
      type: "cursor:update",
      x: 10,
      y: 20,
      draggingNoteId: null,
    });
  });
});
