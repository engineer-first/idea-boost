import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";

const snapshotMessage = (overrides: object) =>
  ({
    type: "snapshot",
    notes: [],
    members: [],
    phase: { kind: "lobby" },
    timer: { status: "idle" },
    serverNow: 0,
    isHost: true,
    phaseRevision: 0,
    decision: null,
    carryovers: [],
    completedVoterIds: [],
    ...overrides,
  }) as ServerMessage;

import { useRoomDisplayName } from "./use-room-display-name";

const currentUserId = "11111111-1111-4111-8111-111111111111";
const members = [
  { userId: currentUserId, name: "保存済み", color: "yellow" as const },
];
afterEach(() => vi.useRealTimers());
function setup(send = vi.fn<(message: ClientMessage) => boolean>(() => true)) {
  const hook = renderHook(
    ({ connected }) =>
      useRoomDisplayName({
        currentUserId,
        members,
        connected,
        blocked: false,
        send,
      }),
    { initialProps: { connected: true } },
  );
  act(() => hook.result.current.request());
  return { ...hook, send };
}
describe("呼び名の編集", () => {
  it("空白と上限超過を送らず取消で保存済み名を保つ", () => {
    const { result, send } = setup();
    for (const name of ["　 ", "あ".repeat(41)]) {
      act(() => result.current.onDraftChange(name));
      act(() => result.current.onConfirm());
      expect(result.current.error).toBeTruthy();
    }
    expect(send).not.toHaveBeenCalled();
    act(() => result.current.onOpenChange(false));
    act(() => result.current.request());
    expect(result.current.draft).toBe("保存済み");
  });
  it("送信失敗・切断・タイムアウトで入力を保持し、無関係な応答で閉じない", () => {
    vi.useFakeTimers();
    const send = vi.fn<(message: ClientMessage) => boolean>(() => false);
    const { result, rerender } = setup(send);
    act(() => result.current.onDraftChange("新しい名"));
    act(() => result.current.onConfirm());
    expect(result.current.error).toBeTruthy();
    expect(result.current.draft).toBe("新しい名");
    send.mockReturnValue(true);
    act(() => result.current.onConfirm());
    act(() => result.current.onConfirm());
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.current.pending).toBe(true);
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "別操作",
        operationId: crypto.randomUUID(),
      }),
    );
    expect(result.current.pending).toBe(true);
    rerender({ connected: false });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(result.current.draft).toBe("新しい名");
    rerender({ connected: true });
    act(() => result.current.onConfirm());
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.pending).toBe(false);
    expect(result.current.open).toBe(true);
  });
  it("サーバー応答と再接続snapshotだけで確定し、operationIdでエラーを対応付ける", () => {
    const { result, send } = setup();
    act(() => result.current.onDraftChange("変更後"));
    act(() => result.current.onConfirm());
    const operationId = (send.mock.calls[0][0] as { operationId: string })
      .operationId;
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "変更できません",
        operationId,
      }),
    );
    expect(result.current.error).toBe("変更できません");
    expect(result.current.open).toBe(true);
    act(() => result.current.onConfirm());
    act(() =>
      result.current.applyMessage(
        snapshotMessage({ members: [{ ...members[0], name: "変更後" }] }),
      ),
    );
    expect(result.current.open).toBe(false);
  });
});
