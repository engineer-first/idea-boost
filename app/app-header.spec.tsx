// 共通ヘッダーのプレゼンテーション層テスト。
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({ pathname: "/home" }));
const displayNameMocks = vi.hoisted(() => ({
  load: vi.fn(async () => ({ ok: true, name: "保存済みの名前" })),
  save: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
}));

vi.mock("@/features/auth/logic/display-name-actions", () => ({
  loadDisplayName: displayNameMocks.load,
  saveDisplayName: displayNameMocks.save,
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

// DOMの操作を検証するため、next/dynamicの読み込み完了を待つ。
// 初期bundleへの混入とSSRはproduction buildのHTTP/ブラウザ検証で確認する。
async function renderHeader(ui: ReactElement) {
  await import("./home-user-menu");
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(ui);
  });
  return result;
}

describe("AppHeader", () => {
  beforeEach(() => {
    navigationMocks.pathname = "/home";
  });

  it("data-testid=app-header で描画される", async () => {
    await renderHeader(<AppHeader userName="田中太郎" />);
    expect(screen.getByTestId("app-header")).toBeInTheDocument();
  });

  it("左に Idea Boost を表示する", async () => {
    await renderHeader(<AppHeader userName="田中太郎" />);
    expect(screen.getByTestId("app-header-brand")).toHaveTextContent(
      "Idea Boost",
    );
  });

  it("ユーザー名をログアウトの左に表示する", async () => {
    await renderHeader(<AppHeader userName="田中太郎" />);
    expect(screen.getByTestId("app-header-user-name")).toHaveTextContent(
      "田中太郎",
    );
    expect(
      screen.getByRole("button", { name: "ログアウト" }),
    ).toBeInTheDocument();
  });

  it("メールアドレスは表示しない", async () => {
    await renderHeader(<AppHeader userName="田中太郎" />);
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("userName が空ならユーザー名は描画しない", async () => {
    await renderHeader(<AppHeader userName="" />);
    expect(
      screen.queryByTestId("app-header-user-name"),
    ).not.toBeInTheDocument();
  });

  it("進行中のルームボードでは共通ヘッダーを表示しない", async () => {
    navigationMocks.pathname = "/rooms/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    await renderHeader(<AppHeader userName="田中太郎" />);

    expect(screen.queryByTestId("app-header")).not.toBeInTheDocument();
  });

  it("スプリント開始前のロビーでは共通ヘッダーを表示する", async () => {
    navigationMocks.pathname =
      "/rooms/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/start";

    await renderHeader(<AppHeader userName="田中太郎" />);

    expect(screen.getByTestId("app-header")).toBeInTheDocument();
  });
});

it("ログアウト送信時にブラウザの候補を消す", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  rememberLastRoom(userId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  navigationMocks.pathname = "/home";
  await renderHeader(<AppHeader userName="田中" />);
  const form = screen
    .getByRole("button", { name: "ログアウト" })
    .closest("form");
  if (!form) throw new Error("ログアウトフォームがありません");
  fireEvent.submit(form);
  expect(readLastRoom(userId)).toBeNull();
});
it("控えめなユーザーメニューから表示名の変更を開ける", async () => {
  navigationMocks.pathname = "/home";
  await renderHeader(
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
  "/about",
  "/rooms/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/start",
  "/invite/ABC123",
])(
  "%s では名前とログアウトを保ち、共通の改名入口を出さない",
  async (pathname) => {
    navigationMocks.pathname = pathname;
    await renderHeader(
      <AppHeader
        userName="はな"
        currentUserId="11111111-1111-4111-8111-111111111111"
      />,
    );
    expect(screen.getByTestId("app-header-user-name")).toHaveTextContent(
      "はな",
    );
    expect(
      screen.getByRole("button", { name: "ログアウト" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ユーザーメニュー" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "表示名を変更" }),
    ).not.toBeInTheDocument();
  },
);

it("ホームで表示名変更を選ぶと保存済みの名前を編集できる", async () => {
  navigationMocks.pathname = "/home";
  await renderHeader(
    <AppHeader
      userName="はな"
      currentUserId="11111111-1111-4111-8111-111111111111"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "ユーザーメニュー" }));
  fireEvent.click(await screen.findByRole("button", { name: "表示名を変更" }));
  expect(
    await screen.findByRole("dialog", { name: "表示名を変更" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByDisplayValue("保存済みの名前"),
  ).toHaveAccessibleName("表示名");
});

it("メニューを開いてから別画面へ移動し、ホームへ戻っても自動で開かない", async () => {
  navigationMocks.pathname = "/home";
  const props = {
    userName: "はな",
    currentUserId: "11111111-1111-4111-8111-111111111111",
  };
  const { rerender } = await renderHeader(<AppHeader {...props} />);
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
  await renderHeader(<AppHeader userName="はな" />);
  fireEvent.click(screen.getByRole("button", { name: "ユーザーメニュー" }));
  expect(
    await screen.findByRole("link", { name: "IdeaBoostについて" }),
  ).toHaveAttribute("href", "/about");
});
