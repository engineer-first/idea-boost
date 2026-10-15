import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("./display-name-actions", () => ({
  loadDisplayName: actions.load,
  saveDisplayName: actions.save,
}));

import { useDisplayName } from "./use-display-name";

const USER = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  actions.load.mockResolvedValue({ ok: true, name: "Googleの名前" });
  actions.save.mockResolvedValue({ ok: true, name: "はな" });
});
describe("任意の共通表示名", () => {
  it("対象ルームが変わったら入力と保存中の状態を破棄し、前の応答で新しい編集を閉じない", async () => {
    let finish!: (value: { ok: true; name: string }) => void;
    actions.save.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const firstRoom = "33333333-3333-4333-8333-333333333333";
    const secondRoom = "44444444-4444-4444-8444-444444444444";
    const { result, rerender } = renderHook(
      ({ roomId }) =>
        useDisplayName({ currentUserId: USER, roomId, initialName: "現在名" }),
      { initialProps: { roomId: firstRoom } },
    );
    await act(async () => result.current.request());
    act(() => result.current.onDraftChange("前のルームの入力"));
    let save!: Promise<void>;
    act(() => {
      save = result.current.onConfirm();
    });
    expect(result.current.pending).toBe(true);
    rerender({ roomId: secondRoom });
    expect(result.current.open).toBe(false);
    expect(result.current.pending).toBe(false);
    expect(result.current.draft).toBe("");
    await act(async () => result.current.request());
    act(() => result.current.onDraftChange("新しいルームの入力"));
    await act(async () => {
      finish({ ok: true, name: "前のルームの入力" });
      await save;
    });
    expect(result.current.open).toBe(true);
    expect(result.current.draft).toBe("新しいルームの入力");
    await act(async () => result.current.onConfirm());
    expect(actions.save).toHaveBeenLastCalledWith({
      expectedPrincipal: USER,
      roomId: secondRoom,
      name: "新しいルームの入力",
    });
  });
  it("自動では開かず、本人が変更を開いた時に現在のGoogle名を初期入力する", async () => {
    const { result } = renderHook(() =>
      useDisplayName({ currentUserId: USER }),
    );
    expect(result.current.open).toBe(false);
    expect(actions.load).not.toHaveBeenCalled();
    await act(async () => result.current.request());
    expect(result.current.open).toBe(true);
    expect(result.current.draft).toBe("Googleの名前");
    expect(actions.save).not.toHaveBeenCalled();
  });
  it("取消・不正入力・保存失敗では現在名を失わず、入力を残して再試行できる", async () => {
    actions.load.mockResolvedValue({ ok: true, name: "保存済み" });
    actions.save.mockResolvedValueOnce({
      ok: false,
      error: "保存できません。再試行してください。",
    });
    const { result } = renderHook(() =>
      useDisplayName({ currentUserId: USER }),
    );
    await act(async () => result.current.request());
    act(() => result.current.onDraftChange("　 "));
    await act(async () => result.current.onConfirm());
    expect(actions.save).not.toHaveBeenCalled();
    act(() => result.current.onDraftChange("新しい名"));
    await act(async () => result.current.onConfirm());
    expect(result.current.draft).toBe("新しい名");
    expect(result.current.open).toBe(true);
    act(() => result.current.onOpenChange(false));
    await act(async () => result.current.request());
    expect(result.current.draft).toBe("保存済み");
    act(() => result.current.onDraftChange("はな"));
    await act(async () => result.current.onConfirm());
    expect(result.current.open).toBe(false);
    expect(actions.save).toHaveBeenLastCalledWith({
      expectedPrincipal: USER,
      name: "はな",
    });
  });
  it("保存中は重複操作・取消を防ぎ、保存成功してから閉じる", async () => {
    let finish!: (value: { ok: true; name: string }) => void;
    actions.save.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useDisplayName({ currentUserId: USER }),
    );
    await act(async () => result.current.request());
    act(() => result.current.onDraftChange("はな"));
    let save!: Promise<void>;
    act(() => {
      save = result.current.onConfirm();
    });
    act(() => {
      void result.current.onConfirm();
      result.current.onOpenChange(false);
    });
    expect(actions.save).toHaveBeenCalledOnce();
    expect(result.current.open).toBe(true);
    await act(async () => {
      finish({ ok: true, name: "はな" });
      await save;
    });
    expect(result.current.open).toBe(false);
  });
  it("アカウントが変わったら前の入力と遅れて届いた応答を引き継がない", async () => {
    let finish!: (value: { ok: true; name: string }) => void;
    actions.load.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result, rerender } = renderHook(
      ({ id }) => useDisplayName({ currentUserId: id }),
      { initialProps: { id: USER } },
    );
    let request!: Promise<void>;
    act(() => {
      request = result.current.request();
    });
    rerender({ id: "22222222-2222-4222-8222-222222222222" });
    await act(async () => {
      finish({ ok: true, name: "前の本人" });
      await request;
    });
    expect(result.current.open).toBe(false);
    expect(result.current.draft).toBe("");
  });
});
