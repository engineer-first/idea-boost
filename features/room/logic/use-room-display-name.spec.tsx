import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DisplayNameResult } from "@/features/auth";
import { useRoomDisplayName } from "./use-room-display-name";

const USER = "11111111-1111-4111-8111-111111111111";
const members = [{ userId: USER, name: "保存済み", color: "yellow" as const }];
function setup(
  save = vi.fn(
    async (): Promise<DisplayNameResult> => ({ ok: true, name: "変更後" }),
  ),
) {
  const send = vi.fn(() => true);
  const hook = renderHook(
    ({ connected }) =>
      useRoomDisplayName({
        roomId: "33333333-3333-4333-8333-333333333333",
        currentUserId: USER,
        members,
        connected,
        blocked: false,
        send,
        save,
      }),
    { initialProps: { connected: true } },
  );
  act(() => hook.result.current.request());
  return { ...hook, save, send };
}
describe("ルームからの共通表示名変更", () => {
  it("空白・上限超過を保存せず、取消でも保存済み名を保つ", async () => {
    const { result, save, send } = setup();
    for (const name of ["　 ", "あ".repeat(16)]) {
      act(() => result.current.onDraftChange(name));
      await act(async () => result.current.onConfirm());
      expect(result.current.error).toBeTruthy();
    }
    expect(save).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    act(() => result.current.onOpenChange(false));
    act(() => result.current.request());
    expect(result.current.draft).toBe("保存済み");
  });
  it("APIの失敗で入力を残し、切断中の保存を防ぎ、再試行成功で閉じる", async () => {
    const save = vi.fn(
      async (): Promise<DisplayNameResult> => ({ ok: true, name: "新しい名" }),
    );
    save.mockResolvedValueOnce({
      ok: false,
      error: "保存できません。もう一度保存してください。",
    });
    const { result, rerender, send } = setup(save);
    act(() => result.current.onDraftChange("新しい名"));
    await act(async () => result.current.onConfirm());
    expect(result.current.draft).toBe("新しい名");
    expect(result.current.open).toBe(true);
    expect(result.current.error).toContain("保存できません");
    rerender({ connected: false });
    await act(async () => result.current.onConfirm());
    expect(save).toHaveBeenCalledOnce();
    rerender({ connected: true });
    await act(async () => result.current.onConfirm());
    expect(result.current.open).toBe(false);
    expect(save).toHaveBeenLastCalledWith({
      roomId: "33333333-3333-4333-8333-333333333333",
      expectedPrincipal: USER,
      name: "新しい名",
    });
    expect(send).not.toHaveBeenCalled();
  });
  it("保存中は旧名を保ち、関係のない共有通知で確定しない", async () => {
    let finish!: (result: DisplayNameResult) => void;
    const save = vi.fn(
      () =>
        new Promise<DisplayNameResult>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = setup(save);
    act(() => result.current.onDraftChange("変更後"));
    act(() => result.current.onConfirm());
    expect(result.current.pending).toBe(true);
    act(() =>
      result.current.applyMessage({
        type: "member:renamed",
        member: { ...members[0], name: "別の変更" },
        operationId: crypto.randomUUID(),
      }),
    );
    expect(result.current.open).toBe(true);
    await act(async () => finish({ ok: true, name: "変更後" }));
    expect(result.current.open).toBe(false);
  });
});
