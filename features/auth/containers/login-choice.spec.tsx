import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  guestIdentityFailure,
  guestIdentitySubmitLabel,
  guestNameLabel,
} from "../logic/guest-identity-copy";
import { LoginChoice } from "./login-choice";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), prepare: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("../logic/guest-identity-actions", () => ({
  prepareGuestIdentity: mocks.prepare,
}));

async function renderChoice() {
  render(
    <LoginChoice
      next="/home"
      isConfigured
      showDevAuth={false}
      googleAction={async () => {}}
      passwordAction={async () => ({})}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "ゲストではじめる" }));
  fireEvent.change(screen.getByRole("textbox", { name: guestNameLabel }), {
    target: { value: "はな" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: guestIdentitySubmitLabel }),
  );
}

beforeEach(() => vi.resetAllMocks());

describe("ログイン方法の選択", () => {
  it("ゲスト開始で名前はなを送信すると本人情報を準備し、成功後nextの/homeへ置き換え遷移する", async () => {
    const pending = Promise.withResolvers<{
      ok: true;
      principal: { kind: "guest"; userId: string };
      reused: boolean;
    }>();
    mocks.prepare.mockReturnValue(pending.promise);
    await renderChoice();
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith({ name: "はな" });
    expect(mocks.replace).not.toHaveBeenCalled();
    pending.resolve({
      ok: true,
      principal: {
        kind: "guest",
        userId: "11111111-1111-4111-8111-111111111111",
      },
      reused: false,
    });
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/home"),
    );
  });

  it("ゲスト名はなの登録が失敗するとalertにエラーを表示し、遷移せず入力を保持する", async () => {
    mocks.prepare.mockResolvedValue({ ok: false, error: guestIdentityFailure });
    await renderChoice();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      guestIdentityFailure,
    );
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith({ name: "はな" });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: guestNameLabel })).toHaveValue(
      "はな",
    );
  });
});
