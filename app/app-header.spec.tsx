// 共通ヘッダーのプレゼンテーション層テスト。
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({ pathname: "/home" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
}));

vi.mock("@/features/auth", () => ({
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
