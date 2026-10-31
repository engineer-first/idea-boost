import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    hook.result.current.applyMessage({
      type: "member_joined",
      member,
      availableAvatarCount: 18,
    }),
  );
  return { ...hook, send };
}
describe("待機画面の顔変更", () => {
  it("同時に複数要求を送らず、本人の確定通知で送信中を解除する", () => {
    const { result, send } = setup();
    act(() => {
      result.current.randomize();
      result.current.randomize();
    });
    expect(send).toHaveBeenCalledTimes(1);
    const request = send.mock.calls[0][0];
    expect(request).toEqual({
      type: "member:randomize-avatar",
      operationId: expect.any(String),
    });
    expect(result.current.pending).toBe(true);
    act(() =>
      result.current.applyMessage({
        type: "member:avatar-updated",
        member: { ...member, avatarId: "face-02" },
        availableAvatarCount: 18,
        operationId:
          "operationId" in request ? (request.operationId ?? "") : "",
      }),
    );
    expect(result.current.pending).toBe(false);
    expect(result.current.disabled).toBe(false);
  });
  it("他の要求へのエラーで送信中を解除せず、本人の拒否だけ表示する", () => {
    const { result, send } = setup();
    act(() => result.current.randomize());
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
        code: "avatar-unavailable",
        message: "候補なし",
        operationId:
          "operationId" in send.mock.calls[0][0]
            ? (send.mock.calls[0][0].operationId ?? "")
            : "",
      }),
    );
    expect(result.current).toMatchObject({
      pending: false,
      unavailable: true,
      disabled: true,
      error: "候補なし",
    });
  });
  it("切断・進行開始・応答期限切れで操作待ちを残さない", () => {
    vi.useFakeTimers();
    const { result, rerender } = setup();
    act(() => result.current.randomize());
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toMatch(/結果を確認/);
    act(() => result.current.randomize());
    rerender({ connected: false, blocked: false });
    expect(result.current).toMatchObject({ pending: false, disabled: true });
    rerender({ connected: true, blocked: true });
    expect(result.current.disabled).toBe(true);
  });
  it("候補数が不明な接続と送信できない接続では変更を確定しない", () => {
    const send = vi.fn<(_: ClientMessage) => boolean>(() => false);
    const { result } = renderHook(() =>
      useRoomAvatar({ connected: true, blocked: false, send }),
    );
    act(() => result.current.randomize());
    expect(send).not.toHaveBeenCalled();
    act(() =>
      result.current.applyMessage({
        type: "member_joined",
        member,
        availableAvatarCount: 18,
      }),
    );
    act(() => result.current.randomize());
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toMatch(/送信できません/);
  });
});
