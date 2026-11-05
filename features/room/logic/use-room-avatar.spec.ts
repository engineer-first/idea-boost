import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLobbyPhase } from "@/contracts/phase.fixture";
import type { ClientMessage } from "@/contracts/room-protocol";
import { buildMembers } from "@/contracts/room-protocol.fixture";
import { useRoomAvatar } from "./use-room-avatar";

const member = buildMembers(1)[0];
afterEach(() => vi.useRealTimers());
function setup(send = vi.fn<(_: ClientMessage) => boolean>(() => true)) {
  const hook = renderHook(
    ({ connected, blocked }) => useRoomAvatar({ connected, blocked, send }),
    { initialProps: { connected: true, blocked: false } },
  );
  act(() =>
    hook.result.current.applyMessage({ type: "member_joined", member }),
  );
  return { ...hook, send };
}
describe("待機画面の顔変更", () => {
  it("同時に複数要求を送らず、本人の確定通知で送信中を解除する", () => {
    const { result, send } = setup();
    act(() => {
      result.current.cycle();
      result.current.cycle();
    });
    expect(send).toHaveBeenCalledTimes(1);
    const request = send.mock.calls[0][0];
    expect(request).toEqual({
      type: "member:cycle-avatar",
      operationId: expect.any(String),
    });
    expect(result.current.pending).toBe(true);
    act(() =>
      result.current.applyMessage({
        type: "member:avatar-updated",
        member: { ...member, avatarId: "face-02" },
        operationId:
          "operationId" in request ? (request.operationId ?? "") : "",
      }),
    );
    expect(result.current.pending).toBe(false);
    expect(result.current.disabled).toBe(false);
  });
  it("他の要求へのエラーで送信中を解除せず、本人の拒否だけ表示する", () => {
    const { result, send } = setup();
    act(() => result.current.cycle());
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "別の要求",
        operationId: crypto.randomUUID(),
      }),
    );
    expect(result.current.pending).toBe(true);
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "変更できません",
        operationId:
          "operationId" in send.mock.calls[0][0]
            ? (send.mock.calls[0][0].operationId ?? "")
            : "",
      }),
    );
    expect(result.current).toMatchObject({
      pending: false,
      disabled: false,
      error: "変更できません",
    });
  });
  it("切断・進行開始・応答期限切れで操作待ちを残さない", () => {
    vi.useFakeTimers();
    const { result, rerender } = setup();
    act(() => result.current.cycle());
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toMatch(/結果を確認/);
    act(() => result.current.cycle());
    rerender({ connected: false, blocked: false });
    expect(result.current).toMatchObject({ pending: false, disabled: true });
    rerender({ connected: true, blocked: true });
    expect(result.current.disabled).toBe(true);
  });
  it("送信できない接続では変更を確定しない", () => {
    const send = vi.fn<(_: ClientMessage) => boolean>(() => false);
    const { result } = renderHook(() =>
      useRoomAvatar({ connected: true, blocked: false, send }),
    );
    act(() => result.current.cycle());
    expect(send).toHaveBeenCalledOnce();
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toMatch(/送信できません/);
  });
  it("候補数の通知がなくても、接続中は変更できる", () => {
    const { result, send } = setup();
    expect(result.current.disabled).toBe(false);
    act(() =>
      result.current.applyMessage({
        type: "snapshot",
        phaseRevision: 0,
        notes: [],
        members: [member],
        phase: buildLobbyPhase(),
        decision: null,
        carryovers: [],
        completedVoterIds: [],
        timer: { status: "idle" },
        serverNow: 0,
      }),
    );
    expect(result.current.disabled).toBe(false);
    act(() => result.current.cycle());
    expect(send).toHaveBeenCalledWith({
      type: "member:cycle-avatar",
      operationId: expect.any(String),
    });
  });
});
