import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  guestIdentityFailure,
  guestNameLabel,
} from "../logic/guest-identity-copy";

const mocks = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock("../logic/guest-identity-actions", () => ({
  prepareGuestIdentity: mocks.prepare,
}));

import { ROOM_DISPLAY_NAME_MAX_LENGTH } from "@/contracts/room-protocol";
import { GuestNameForm } from "./guest-name-form";

const principal = {
  kind: "guest",
  userId: "11111111-1111-4111-8111-111111111111",
} as const;
beforeEach(() => vi.resetAllMocks());
function fill(name: string) {
  fireEvent.change(screen.getByRole("textbox", { name: guestNameLabel }), {
    target: { value: name },
  });
}
describe("ゲストの名前入力", () => {
  it("入力して送信するとActionを1回呼び本人情報を通知する", async () => {
    mocks.prepare.mockResolvedValue({ ok: true, principal, reused: false });
    const onPrepared = vi.fn();
    render(<GuestNameForm onPrepared={onPrepared} submitLabel="参加する" />);
    fill("はな");
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));
    await waitFor(() => expect(onPrepared).toHaveBeenCalledWith(principal));
    expect(onPrepared).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith({ name: "はな" });
  });
  it("送信中はボタンを無効にし二重クリックでもActionを1回だけ呼ぶ", async () => {
    const pending = Promise.withResolvers<{
      ok: true;
      principal: typeof principal;
      reused: boolean;
    }>();
    mocks.prepare.mockReturnValue(pending.promise);
    const onPrepared = vi.fn();
    render(<GuestNameForm onPrepared={onPrepared} />);
    fill("はな");
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeDisabled();
    fireEvent.click(button);
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(onPrepared).not.toHaveBeenCalled();
    await act(async () =>
      pending.resolve({ ok: true, principal, reused: false }),
    );
    await waitFor(() =>
      expect(onPrepared).toHaveBeenCalledExactlyOnceWith(principal),
    );
  });
  it("失敗時にエラーと入力を保持し再送信の成功で本人情報を通知する", async () => {
    mocks.prepare
      .mockResolvedValueOnce({ ok: false, error: "接続できませんでした。" })
      .mockResolvedValueOnce({ ok: true, principal, reused: false });
    const onPrepared = vi.fn();
    render(<GuestNameForm onPrepared={onPrepared} submitLabel="参加する" />);
    fill("はな");
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "接続できませんでした。",
    );
    expect(screen.getByRole("textbox")).toHaveValue("はな");
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(onPrepared).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));
    await waitFor(() =>
      expect(onPrepared).toHaveBeenCalledExactlyOnceWith(principal),
    );
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
  });
  it.each(["   ", "あ".repeat(ROOM_DISPLAY_NAME_MAX_LENGTH + 1)])(
    "不正な名前 %j はActionを呼ばずエラーを表示する",
    async (name) => {
      const onPrepared = vi.fn();
      render(<GuestNameForm onPrepared={onPrepared} />);
      fill(name);
      fireEvent.click(screen.getByRole("button"));
      expect(await screen.findByRole("alert")).not.toBeEmptyDOMElement();
      expect(screen.getByRole("textbox")).toHaveFocus();
      expect(mocks.prepare).not.toHaveBeenCalled();
      expect(onPrepared).not.toHaveBeenCalled();
    },
  );
  it("成功後に再送信してもActionとonPreparedは1回だけで入力とボタンを無効に保つ", async () => {
    mocks.prepare.mockResolvedValue({ ok: true, principal, reused: false });
    const onPrepared = vi.fn();
    render(<GuestNameForm onPrepared={onPrepared} />);
    fill("はな");
    const button = screen.getByRole("button");
    fireEvent.click(button);
    await waitFor(() => expect(onPrepared).toHaveBeenCalledOnce());
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(button).toBeDisabled();
    fireEvent.click(button);
    const form = button.closest("form");
    if (!form) throw new Error("名前入力フォームがありません");
    fireEvent.submit(form);
    await act(async () => {});
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(onPrepared).toHaveBeenCalledOnce();
  });
  it("Actionの例外時はエラーと入力を保持し送信中を解除して入力欄へ戻す", async () => {
    mocks.prepare.mockRejectedValue(new Error("network"));
    const onPrepared = vi.fn();
    render(<GuestNameForm onPrepared={onPrepared} />);
    fill("はな");
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      guestIdentityFailure,
    );
    expect(screen.getByRole("textbox")).toHaveValue("はな");
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(screen.getByRole("textbox")).toBeEnabled();
    expect(screen.getByRole("button")).toBeEnabled();
    expect(onPrepared).not.toHaveBeenCalled();
  });
  it.each(["入力エラー", "Action失敗"])(
    "%s後に入力するとエラーが消え正しい名前で再送できる",
    async (condition) => {
      mocks.prepare.mockResolvedValueOnce({ ok: false, error: "登録失敗" });
      const onPrepared = vi.fn();
      render(<GuestNameForm onPrepared={onPrepared} />);
      fill(condition === "入力エラー" ? "   " : "はな");
      fireEvent.click(screen.getByRole("button"));
      await screen.findByRole("alert");
      expect(screen.getByRole("textbox")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      fill("たろう");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
      mocks.prepare
        .mockReset()
        .mockResolvedValue({ ok: true, principal, reused: false });
      fireEvent.click(screen.getByRole("button"));
      await waitFor(() =>
        expect(onPrepared).toHaveBeenCalledExactlyOnceWith(principal),
      );
      expect(mocks.prepare).toHaveBeenLastCalledWith({ name: "たろう" });
    },
  );
});
