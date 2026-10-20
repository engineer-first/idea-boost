import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@/contracts/room-protocol";
import { useSharingReactions } from "./use-sharing-reactions";

const phase = { kind: "step", phase: 1, step: 2 } as const;
const event = {
  type: "reaction:received",
  id: "11111111-1111-4111-8111-111111111111",
  senderId: "22222222-2222-4222-8222-222222222222",
  kind: "like",
  phaseRevision: 3,
} as const;

afterEach(() => vi.useRealTimers());

describe("useSharingReactions", () => {
  it("接続中の共有画面からいいねを送り、連打を短時間抑える", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => true);
    const { result } = renderHook(() =>
      useSharingReactions({
        phase,
        phaseRevision: 3,
        connectionStatus: "open",
        send,
      }),
    );
    act(() => {
      result.current.sendLike();
      result.current.sendLike();
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: "reaction:send",
      kind: "like",
      phaseRevision: 3,
    });
    act(() => vi.advanceTimersByTime(400));
    act(() => result.current.sendLike());
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("3つ送ったら最初の表示が消えるまで4つ目を送らない", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => true);
    const { result } = renderHook(() =>
      useSharingReactions({
        phase,
        phaseRevision: 3,
        connectionStatus: "open",
        send,
      }),
    );
    act(() => result.current.sendLike());
    for (let index = 0; index < 2; index++) {
      act(() => vi.advanceTimersByTime(400));
      act(() => result.current.sendLike());
    }
    expect(send).toHaveBeenCalledTimes(3);
    expect(result.current.canSendLike).toBe(false);
    act(() => vi.advanceTimersByTime(400));
    act(() => result.current.sendLike());
    expect(send).toHaveBeenCalledTimes(3);
    act(() => vi.advanceTimersByTime(1_800));
    expect(result.current.canSendLike).toBe(true);
    act(() => result.current.sendLike());
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("工程が更新されて表示が消えたら、3つの送信上限も解除する", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => true);
    const { result, rerender } = renderHook(
      ({ revision }) =>
        useSharingReactions({
          phase,
          phaseRevision: revision,
          connectionStatus: "open",
          send,
        }),
      { initialProps: { revision: 3 } },
    );
    for (let index = 0; index < 3; index++) {
      act(() => result.current.sendLike());
      act(() => vi.advanceTimersByTime(400));
    }
    expect(result.current.canSendLike).toBe(false);
    rerender({ revision: 4 });
    expect(result.current.canSendLike).toBe(true);
    act(() => result.current.sendLike());
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("工程更新後も直前の送信から400msは送信を待つ", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => true);
    const { result, rerender } = renderHook(
      ({ revision }) =>
        useSharingReactions({
          phase,
          phaseRevision: revision,
          connectionStatus: "open",
          send,
        }),
      { initialProps: { revision: 3 } },
    );
    act(() => result.current.sendLike());
    act(() => vi.advanceTimersByTime(100));
    act(() =>
      result.current.applyMessage({
        type: "phase:updated",
        phase,
        phaseRevision: 4,
      } as ServerMessage),
    );
    rerender({ revision: 4 });
    expect(result.current.canSendLike).toBe(false);
    act(() => result.current.sendLike());
    expect(send).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.canSendLike).toBe(true);
    act(() => result.current.sendLike());
    expect(send).toHaveBeenLastCalledWith({
      type: "reaction:send",
      kind: "like",
      phaseRevision: 4,
    });
  });

  it.each(["操作停止", "再接続", "snapshot"] as const)(
    "%sの後も同じ工程の3件上限を維持する",
    (interruption) => {
      vi.useFakeTimers();
      const send = vi.fn(() => true);
      const { result, rerender } = renderHook(
        ({
          blocked,
          connectionStatus,
        }: {
          blocked: boolean;
          connectionStatus: "open" | "closed";
        }) =>
          useSharingReactions({
            phase,
            phaseRevision: 3,
            blocked,
            connectionStatus,
            send,
          }),
        { initialProps: { blocked: false, connectionStatus: "open" } },
      );
      for (let index = 0; index < 3; index++) {
        act(() => result.current.sendLike());
        act(() => vi.advanceTimersByTime(400));
      }
      if (interruption === "snapshot") {
        act(() =>
          result.current.applyMessage({
            type: "snapshot",
            phase,
            phaseRevision: 3,
          } as ServerMessage),
        );
      } else {
        rerender({
          blocked: interruption === "操作停止",
          connectionStatus: interruption === "再接続" ? "closed" : "open",
        });
        rerender({ blocked: false, connectionStatus: "open" });
      }
      expect(result.current.canSendLike).toBe(false);
      act(() => result.current.sendLike());
      expect(send).toHaveBeenCalledTimes(3);
      act(() => vi.advanceTimersByTime(1_800));
      expect(result.current.canSendLike).toBe(true);
      act(() => result.current.sendLike());
      expect(send).toHaveBeenCalledTimes(4);
    },
  );

  it("同じ送信者のいいねは3つまで表示し、別の送信者の枠は残す", () => {
    const { result } = renderHook(() =>
      useSharingReactions({
        phase,
        phaseRevision: 3,
        connectionStatus: "open",
        send: vi.fn(),
      }),
    );
    act(() => {
      for (let index = 0; index < 4; index++)
        result.current.applyMessage({ ...event, id: `reaction-${index}` });
      result.current.applyMessage({
        ...event,
        id: "another-account",
        senderId: "33333333-3333-4333-8333-333333333333",
      });
    });
    expect(result.current.reactions).toHaveLength(4);
    expect(result.current.reactions.map((reaction) => reaction.id)).toEqual([
      "reaction-0",
      "reaction-1",
      "reaction-2",
      "another-account",
    ]);
  });

  it("受信したいいねを3秒だけ表示し、同じイベントを重複表示しない", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useSharingReactions({
        phase,
        phaseRevision: 3,
        connectionStatus: "open",
        send: vi.fn(),
      }),
    );
    act(() => {
      result.current.applyMessage(event);
      result.current.applyMessage(event);
    });
    expect(result.current.reactions).toHaveLength(1);
    act(() => vi.advanceTimersByTime(2999));
    expect(result.current.reactions).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.reactions).toHaveLength(0);
  });

  it("古い工程の受信は表示せず、切断したら表示と送信を止める", () => {
    const send = vi.fn(() => true);
    const { result, rerender } = renderHook(
      ({ connectionStatus }: { connectionStatus: "open" | "closed" }) =>
        useSharingReactions({
          phase,
          phaseRevision: 3,
          connectionStatus,
          send,
        }),
      { initialProps: { connectionStatus: "open" } },
    );
    act(() => result.current.applyMessage({ ...event, phaseRevision: 2 }));
    expect(result.current.reactions).toHaveLength(0);
    act(() => result.current.applyMessage(event));
    rerender({ connectionStatus: "closed" });
    expect(result.current.reactions).toHaveLength(0);
    act(() => result.current.sendLike());
    expect(send).not.toHaveBeenCalled();
  });

  it("大量に届いても直近の6件に絞り、工程更新で古い反応を消す", () => {
    const { result } = renderHook(() =>
      useSharingReactions({
        phase,
        phaseRevision: 3,
        connectionStatus: "open",
        send: vi.fn(),
      }),
    );
    act(() => {
      for (let n = 0; n < 20; n++)
        result.current.applyMessage({
          ...event,
          id: `reaction-${n}`,
          senderId: `account-${n % 3}`,
        });
    });
    expect(result.current.reactions).toHaveLength(6);
    act(() =>
      result.current.applyMessage({
        type: "phase:updated",
        phase: { kind: "step", phase: 1, step: 3 },
        phaseRevision: 4,
      } as ServerMessage),
    );
    expect(result.current.reactions).toHaveLength(0);
    act(() => result.current.applyMessage(event));
    expect(result.current.reactions).toHaveLength(0);
  });
});
