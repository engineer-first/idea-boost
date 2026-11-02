import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/session/env", () => ({
  isAuthConfigured: () => true,
  isDevAuthEnabled: () => false,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/features/room-lifecycle/logic/room-creation-storage", () => ({
  readRoomCreationIntent: vi.fn().mockResolvedValue(null),
  listRoomCreationIntents: vi.fn().mockResolvedValue([]),
  subscribeRoomCreations: () => () => {},
}));

import HomePage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue(null);
});

it("認証設定があり本人がいない場合は始め方の選択画面へリダイレクトする", async () => {
  await expect(HomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    "redirect:/login?next=%2Fhome",
  );
});

it("ゲスト本人に連携の入口を表示する", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  mocks.user.mockResolvedValue({ kind: "guest", sub: userId });
  render(await HomePage({ searchParams: Promise.resolve({}) }));
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(screen.getByTestId("home-view")).toBeInTheDocument();
  expect(
    screen.getByRole("button", {
      name: "Googleと連携して、別の端末からも記録を見返す",
    }),
  ).toBeVisible();
});

it("認証済みホームの主要領域を一つのmainから辿れる", async () => {
  mocks.user.mockResolvedValue({
    kind: "guest",
    sub: "11111111-1111-4111-8111-111111111111",
  });
  render(await HomePage({ searchParams: Promise.resolve({}) }));
  expect(screen.getAllByRole("main")).toHaveLength(1);
  const main = screen.getByRole("main");
  expect(within(main).getByRole("heading", { level: 1 })).toBeInTheDocument();
  expect(
    within(main).getByRole("textbox", { name: "招待コード" }),
  ).toBeInTheDocument();
});

it("アカウント本人には連携済みの案内を表示し連携ボタンを表示しない", async () => {
  mocks.user.mockResolvedValue({ kind: "account", sub: "account" });
  render(await HomePage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText(/Googleと連携済みです/)).toBeVisible();
  expect(
    screen.queryByRole("button", {
      name: "Googleと連携して、別の端末からも記録を見返す",
    }),
  ).not.toBeInTheDocument();
});
it("有効な連携結果を表示する", async () => {
  mocks.user.mockResolvedValue({ kind: "guest", sub: "guest" });
  const account_link = "google_account_in_use";
  render(await HomePage({ searchParams: Promise.resolve({ account_link }) }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "このGoogleアカウントは別の記録で使われているため",
  );
});
it.each(["invalid", ["google_account_in_use", "failed"]])(
  "不正な連携結果 %s は表示しない",
  async (account_link) => {
    mocks.user.mockResolvedValue({ kind: "guest", sub: "guest" });
    render(await HomePage({ searchParams: Promise.resolve({ account_link }) }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  },
);
