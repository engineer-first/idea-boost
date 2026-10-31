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
      guestForm={<p>ゲスト名フォーム</p>}
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
      guestForm={<p>ゲスト名フォーム</p>}
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

const choiceProps = {
  isConfigured: true,
  showDevAuth: false,
  googleAction: async () => {},
  passwordAction: async () => ({}),
  guestForm: <p>ゲスト名フォーム</p>,
};

it("LoginCardは初期表示でGoogleとゲストの開始ボタンを表示し、ゲスト名フォームを隠す", () => {
  render(<LoginCard {...choiceProps} />);
  expect(
    screen.getByRole("button", { name: "Googleではじめる" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "ゲストではじめる" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "ゲストではじめる" }),
  ).toHaveAttribute("type", "button");
  expect(screen.getByText("または")).toBeInTheDocument();
  expect(screen.queryByText("ゲスト名フォーム")).not.toBeInTheDocument();
});

it("LoginCardでゲスト開始を押すと名前フォームを表示してGoogleを隠し、戻るを押すと選択に戻る", () => {
  render(<LoginCard {...choiceProps} />);
  fireEvent.click(screen.getByRole("button", { name: "ゲストではじめる" }));
  expect(screen.getByText("ゲスト名フォーム")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Googleではじめる" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "戻る" }));
  expect(
    screen.getByRole("button", { name: "Googleではじめる" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "ゲストではじめる" }),
  ).toBeVisible();
  expect(screen.queryByText("ゲスト名フォーム")).not.toBeInTheDocument();
});

it("LoginCardでGoogle開始を送信するとgoogleActionが1回呼ばれる", async () => {
  const googleAction = vi.fn(async (_form: FormData) => {});
  render(<LoginCard {...choiceProps} googleAction={googleAction} />);
  const button = screen.getByRole("button", { name: "Googleではじめる" });
  expect(button).toHaveAttribute("type", "submit");
  fireEvent.click(button);
  await waitFor(() =>
    expect(googleAction).toHaveBeenCalledExactlyOnceWith(expect.any(FormData)),
  );
});

it("LoginCardは認証未設定の場合Googleとゲストの開始ボタンを両方無効にする", () => {
  render(<LoginCard {...choiceProps} isConfigured={false} />);
  expect(
    screen.getByRole("button", { name: "Googleではじめる" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "ゲストではじめる" }),
  ).toBeDisabled();
});

it("LoginCardはshowDevAuthがfalseの場合開発用ログインボタンを表示しない", () => {
  render(<LoginCard {...choiceProps} showDevAuth={false} />);
  expect(
    screen.queryByRole("button", { name: "開発用ユーザーでログイン" }),
  ).not.toBeInTheDocument();
});

it("LoginCardでゲスト開始を押すとゲスト段階の見出しへフォーカスが移る", () => {
  render(<LoginCard {...choiceProps} />);
  fireEvent.click(screen.getByRole("button", { name: "ゲストではじめる" }));
  expect(
    screen.getByRole("heading", { level: 2, name: "ゲストではじめる" }),
  ).toHaveFocus();
});

it("LoginCardでゲスト段階から戻るを押すとゲスト開始ボタンへフォーカスが戻る", () => {
  render(<LoginCard {...choiceProps} />);
  fireEvent.click(screen.getByRole("button", { name: "ゲストではじめる" }));
  fireEvent.click(screen.getByRole("button", { name: "戻る" }));
  expect(
    screen.getByRole("button", { name: "ゲストではじめる" }),
  ).toHaveFocus();
});

it("LoginCardは初回描画やstepが変わらない再描画ではカード外のフォーカスを奪わない", () => {
  render(<button type="button">カード外の操作</button>);
  const outside = screen.getByRole("button", { name: "カード外の操作" });
  outside.focus();
  const { rerender } = render(<LoginCard {...choiceProps} />);
  expect(outside).toHaveFocus();
  rerender(<LoginCard {...choiceProps} error="接続できませんでした。" />);
  expect(outside).toHaveFocus();
});

it("LoginCardはguestPendingがtrueのゲスト段階では戻るを無効にする", () => {
  render(<LoginCard {...choiceProps} guestPending />);
  fireEvent.click(screen.getByRole("button", { name: "ゲストではじめる" }));
  const back = screen.getByRole("button", { name: "戻る" });
  expect(back).toBeDisabled();
  fireEvent.click(back);
  expect(
    screen.getByRole("heading", { level: 2, name: "ゲストではじめる" }),
  ).toBeInTheDocument();
});
