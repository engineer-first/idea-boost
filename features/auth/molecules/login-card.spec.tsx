import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { DevAuthState } from "../logic/actions";
import { LoginCard } from "./login-card";

it("失敗後も入力を保持し、訂正したパスワードで同じ認証アクションへ再試行できる", async () => {
  const passwordAction = vi.fn(
    async (_state: DevAuthState, _form: FormData) => ({
      error: "メールアドレスまたはパスワードが違います。",
    }),
  );
  render(
    <LoginCard
      isConfigured
      showDevAuth
      googleAction={async () => {}}
      passwordAction={passwordAction}
    />,
  );
  const email = screen.getByRole("textbox", { name: "メールアドレス" });
  const password = screen.getByPlaceholderText("パスワード");
  fireEvent.change(email, { target: { value: "member@example.test" } });
  fireEvent.change(password, { target: { value: "incorrect" } });
  fireEvent.click(
    screen.getByRole("button", { name: "開発用ユーザーでログイン" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "メールアドレスまたはパスワードが違います。",
  );
  expect(email).toHaveValue("member@example.test");
  expect(password).toHaveValue("incorrect");
  fireEvent.change(password, { target: { value: "password" } });
  fireEvent.click(
    screen.getByRole("button", { name: "開発用ユーザーでログイン" }),
  );
  await waitFor(() => expect(passwordAction).toHaveBeenCalledTimes(2));
  const retry = passwordAction.mock.calls[1];
  expect(retry[1].get("email")).toBe("member@example.test");
  expect(retry[1].get("password")).toBe("password");
});

it("送信中はログイン操作を無効にし、完了後に再試行できる", async () => {
  let finish!: (state: DevAuthState) => void;
  render(
    <LoginCard
      isConfigured
      showDevAuth
      googleAction={async () => {}}
      passwordAction={() =>
        new Promise((resolve) => {
          finish = resolve;
        })
      }
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "開発用ユーザーでログイン" }),
  );
  expect(
    await screen.findByRole("button", { name: "ログイン中…" }),
  ).toBeDisabled();
  await act(async () => finish({ error: "接続できませんでした。" }));
  expect(
    screen.getByRole("button", { name: "開発用ユーザーでログイン" }),
  ).toBeEnabled();
});
