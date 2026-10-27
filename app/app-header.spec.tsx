// 共通ヘッダーのプレゼンテーション層テスト。
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({ pathname: "/home" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
}));

vi.mock("@/features/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth")>()),
  signOut: vi.fn(),
}));

import { AppHeader } from "@/app/app-header";
import {
  readLastRoom,
  rememberLastRoom,
} from "@/lib/room-client/last-room-storage";

describe("AppHeader", () => {
  beforeEach(() => {
    navigationMocks.pathname = "/home";
  });

  it("data-testid=app-header で描画される", () => {
    render(<AppHeader userName="田中太郎" />);
    expect(screen.getByTestId("app-header")).toBeInTheDocument();
  });

  it("左に Idea Boost を表示する", () => {
    render(<AppHeader userName="田中太郎" />);
    expect(screen.getByTestId("app-header-brand")).toHaveTextContent(
      "Idea Boost",
    );
  });

  it("ユーザー名をログアウトの左に表示する", () => {
    render(<AppHeader userName="田中太郎" />);
    expect(screen.getByTestId("app-header-user-name")).toHaveTextContent(
      "田中太郎",
    );
    expect(
      screen.getByRole("button", { name: "ログアウト" }),
    ).toBeInTheDocument();
  });

  it("メールアドレスは表示しない", () => {
    render(<AppHeader userName="田中太郎" />);
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("userName が空ならユーザー名は描画しない", () => {
    render(<AppHeader userName="" />);
    expect(
      screen.queryByTestId("app-header-user-name"),
    ).not.toBeInTheDocument();
  });

  it("進行中のルームボードでは共通ヘッダーを表示しない", () => {
    navigationMocks.pathname = "/rooms/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    render(<AppHeader userName="田中太郎" />);

    expect(screen.queryByTestId("app-header")).not.toBeInTheDocument();
  });

  it("LP（/about）ではLP自身のヘッダーを使うため共通ヘッダーを表示しない", () => {
    navigationMocks.pathname = "/about";

    render(<AppHeader userName="田中太郎" />);

    expect(screen.queryByTestId("app-header")).not.toBeInTheDocument();
  });

  it("スプリント開始前のロビーでは共通ヘッダーを表示する", () => {
    navigationMocks.pathname =
      "/rooms/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/start";

    render(<AppHeader userName="田中太郎" />);

    expect(screen.getByTestId("app-header")).toBeInTheDocument();
  });
});

it("ログアウト送信時にブラウザの候補を消す", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  rememberLastRoom(userId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  navigationMocks.pathname = "/home";
  render(<AppHeader userName="田中" />);
  const form = screen
    .getByRole("button", { name: "ログアウト" })
    .closest("form");
  if (!form) throw new Error("ログアウトフォームがありません");
  fireEvent.submit(form);
  expect(readLastRoom(userId)).toBeNull();
});
it("控えめなユーザーメニューから表示名の変更を開ける", async () => {
  navigationMocks.pathname = "/home";
  render(
    <AppHeader
      userName="はな"
      currentUserId="11111111-1111-4111-8111-111111111111"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "ユーザーメニュー" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(
    await screen.findByRole("button", { name: "表示名を変更" }),
  ).toBeInTheDocument();
});

it.each([
  "/rooms/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/start",
  "/invite/ABC123",
])("%s では名前とログアウトを保ち、共通の改名入口を出さない", (pathname) => {
  navigationMocks.pathname = pathname;
  render(
    <AppHeader
      userName="はな"
      currentUserId="11111111-1111-4111-8111-111111111111"
    />,
  );
  expect(screen.getByTestId("app-header-user-name")).toHaveTextContent("はな");
  expect(
    screen.getByRole("button", { name: "ログアウト" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "ユーザーメニュー" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("dialog", { name: "表示名を変更" }),
  ).not.toBeInTheDocument();
});

it("メニューを開いてから別画面へ移動し、ホームへ戻っても自動で開かない", async () => {
  navigationMocks.pathname = "/home";
  const props = {
    userName: "はな",
    currentUserId: "11111111-1111-4111-8111-111111111111",
  };
  const { rerender } = render(<AppHeader {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "ユーザーメニュー" }));
  await screen.findByRole("button", { name: "表示名を変更" });
  navigationMocks.pathname =
    "/rooms/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/start";
  rerender(<AppHeader {...props} />);
  expect(
    screen.queryByRole("button", { name: "ユーザーメニュー" }),
  ).not.toBeInTheDocument();
  navigationMocks.pathname = "/home";
  rerender(<AppHeader {...props} />);
  expect(
    screen.getByRole("button", { name: "ユーザーメニュー" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "表示名を変更" }),
  ).not.toBeInTheDocument();
});

it("ホームのユーザーメニューから説明ページを開ける", async () => {
  navigationMocks.pathname = "/home";
  render(<AppHeader userName="はな" />);
  fireEvent.click(screen.getByRole("button", { name: "ユーザーメニュー" }));
  expect(
    await screen.findByRole("link", { name: "IdeaBoostについて" }),
  ).toHaveAttribute("href", "/about");
});
