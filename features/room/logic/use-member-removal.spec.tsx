import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientMessage } from "@/contracts/room-protocol";
import { useMemberRemoval } from "./use-member-removal";

const TARGET = "22222222-2222-4222-8222-222222222222";
const HOST = "11111111-1111-4111-8111-111111111111";
function setup(
  overrides: Partial<Parameters<typeof useMemberRemoval>[0]> = {},
) {
  const send = vi.fn((_message: ClientMessage) => true);
  const props = {
    isHost: true,
    currentUserId: HOST,
    hostRevision: 3,
    connected: true,
    blocked: false,
    members: [{ userId: TARGET, name: "Hana Sato", color: "blue" as const }],
    send,
    ...overrides,
  };
  return {
    ...renderHook((options) => useMemberRemoval(options), {
      initialProps: props,
    }),
    props,
    send,
  };
}
afterEach(() => vi.useRealTimers());
describe("参加者の退出操作", () => {
  it.each([
    { isHost: false },
    { connected: false },
    { blocked: true },
    { hostRevision: null },
  ])("権限・接続が揃わなければ確認を開かない %o", (state) => {
    const { result, send } = setup(state);
    act(() => result.current.request(TARGET));
    expect(result.current.open).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it("自己と存在しない対象を選択しない", () => {
    const { result } = setup();
    act(() => result.current.request(HOST));
    expect(result.current.open).toBe(false);
    act(() => result.current.request("absent"));
    expect(result.current.open).toBe(false);
  });
  it("確認後のみ送信し、二重送信と無関係の応答を抑止、拒否後は再試行できる", () => {
    const { result, send } = setup();
    act(() => result.current.request(TARGET));
    expect(send).not.toHaveBeenCalled();
    act(() => {
      result.current.onConfirm();
      result.current.onConfirm();
    });
    expect(send).toHaveBeenCalledOnce();
    expect(result.current.pending).toBe(true);
    const op = send.mock.calls[0][0] as Extract<
      ClientMessage,
      { type: "member:remove" }
    >;
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "別操作",
        operationId: crypto.randomUUID(),
      }),
    );
    expect(result.current.pending).toBe(true);
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "退出できません",
        operationId: op.operationId,
      }),
    );
    expect(result.current.error).toBe("退出できません");
    act(() => result.current.onConfirm());
    expect(send).toHaveBeenCalledTimes(2);
    const retry = send.mock.calls[1][0] as Extract<
      ClientMessage,
      { type: "member:remove" }
    >;
    act(() =>
      result.current.applyMessage({
        type: "member:removed",
        targetUserId: TARGET,
        operationId: op.operationId,
      }),
    );
    expect(result.current.pending).toBe(true);
    act(() =>
      result.current.applyMessage({
        type: "member:removed",
        targetUserId: TARGET,
        operationId: retry.operationId,
      }),
    );
    expect(result.current.open).toBe(false);
    expect(result.current.pending).toBe(false);
  });
  it("切断・timeout・送信失敗で再試行可能にする", () => {
    vi.useFakeTimers();
    const { result, rerender, props } = setup();
    act(() => result.current.request(TARGET));
    act(() => result.current.onConfirm());
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.error).toContain("結果を確認できません");
    act(() => result.current.onConfirm());
    rerender({ ...props, connected: false });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toContain("接続が切れました");
    rerender({ ...props, send: () => false });
    act(() => result.current.onConfirm());
    expect(result.current.error).toContain("送信できません");
  });
  it("ホスト世代変更で古い確認を閉じ、再接続のsnapshotで退出済みを確認する", () => {
    const { result, rerender, props } = setup();
    act(() => result.current.request(TARGET));
    rerender({ ...props, hostRevision: 4 });
    expect(result.current.open).toBe(false);
    act(() => result.current.request(TARGET));
    act(() =>
      result.current.applyMessage({
        type: "snapshot",
        completedVoterIds: [],
        phaseRevision: 0,
        isHost: true,
        decision: null,
        carryovers: [],
        outcomePublished: false,
        timer: { status: "idle" },
        serverNow: Date.now(),
        notes: [],
        members: [],
        phase: { kind: "lobby" },
        hostRevision: 4,
      }),
    );
    expect(result.current.open).toBe(false);
  });
});
