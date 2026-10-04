import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientMessage } from "@/contracts/room-protocol";
import { useHostTransfer } from "./use-host-transfer";

const TARGET = "22222222-2222-4222-8222-222222222222";
function setup(overrides: Partial<Parameters<typeof useHostTransfer>[0]> = {}) {
  const send = vi.fn((_message: ClientMessage) => true);
  const props = {
    isHost: true,
    hostRevision: 3,
    connected: true,
    blocked: false,
    send,
    ...overrides,
  };
  const hook = renderHook((options) => useHostTransfer(options), {
    initialProps: props,
  });
  return { ...hook, props, send };
}
afterEach(() => vi.useRealTimers());
describe("useHostTransfer", () => {
  it.each([
    { isHost: false },
    { connected: false },
    { blocked: true },
    { hostRevision: null },
  ])("操作できない状態は送信しない %o", (state) => {
    const { result, send } = setup(state);
    act(() => result.current.transfer(TARGET));
    expect(send).not.toHaveBeenCalled();
  });
  it("多重送信を抑止し、関係のない付箋操作errorで待機を解除しない", () => {
    const { result, send } = setup();
    act(() => {
      result.current.transfer(TARGET);
      result.current.transfer(TARGET);
    });
    expect(send).toHaveBeenCalledOnce();
    expect(result.current.pending).toBe(true);
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "付箋の変更に失敗",
        operationId: "33333333-3333-4333-8333-333333333333",
      }),
    );
    expect(result.current.pending).toBe(true);
    const operation = send.mock.calls[0]?.[0];
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "相手が切断しました",
        operationId:
          operation && "operationId" in operation
            ? operation.operationId
            : undefined,
      }),
    );
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe("相手が切断しました");
    act(() => result.current.transfer(TARGET));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).not.toEqual(operation);
  });
  it("送信できなければすぐ再操作できる", () => {
    const { result } = setup({ send: () => false });
    act(() => result.current.transfer(TARGET));
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toContain("送信できません");
  });
  it("timeout後の再試行を古い要求のerrorで中断しない", () => {
    vi.useFakeTimers();
    const { result, send } = setup();
    act(() => result.current.transfer(TARGET));
    const old = send.mock.calls[0]?.[0];
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toContain("結果を確認できません");
    act(() => result.current.transfer(TARGET));
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "古い結果",
        operationId: old && "operationId" in old ? old.operationId : undefined,
      }),
    );
    expect(result.current.pending).toBe(true);
  });
  it("切断で待機を解除しsnapshotから回復する", () => {
    const { result, rerender, props } = setup();
    act(() => result.current.transfer(TARGET));
    rerender({ ...props, connected: false });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toContain("接続が切れました");
    act(() =>
      result.current.applyMessage({
        type: "host:updated",
        hostUserId: TARGET,
        hostRevision: 4,
      }),
    );
    expect(result.current.error).toBeNull();
  });
});
