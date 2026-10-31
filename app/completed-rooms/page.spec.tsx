import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
}));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));
vi.mock("@/features/completed-rooms", async (original) => ({
  ...(await original<typeof import("@/features/completed-rooms")>()),
  CompletedRooms: ({ accountLink }: { accountLink?: ReactNode }) => (
    <div>一覧コンテナ{accountLink}</div>
  ),
}));

import Page from "./page";

beforeEach(() => vi.clearAllMocks());
it("ゲスト本人は成果コンテナを描画する", async () => {
  mocks.user.mockResolvedValue({ kind: "guest", sub: "guest", email: null });
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText(/一覧コンテナ/)).toBeVisible();
  expect(
    screen.getByRole("button", {
      name: "Googleと連携して、別の端末からも記録を見返す",
    }),
  ).toBeVisible();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("本人情報が無いときは自動遷移せず、Googleは元の成果へ・ゲストはホームへ進む始め方の選択へ案内する", async () => {
  mocks.user.mockResolvedValue(null);
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("region", { name: "Googleとの連携" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "成果を表示できません" }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "本人情報を確認できないため、成果を表示できません。成果を残したときと同じブラウザで開いてください。",
    ),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "始め方を選ぶ" })).toHaveAttribute(
    "href",
    `/login?next=${encodeURIComponent("/completed-rooms")}&guest_next=%2Fhome`,
  );
  expect(
    screen.queryByRole("link", { name: "ホームへ" }),
  ).not.toBeInTheDocument();
});

it("アカウント本人には連携済み表示を出して連携ボタンを出さない", async () => {
  mocks.user.mockResolvedValue({ kind: "account", sub: "account" });
  render(await Page({ searchParams: Promise.resolve({}) }));
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
  render(await Page({ searchParams: Promise.resolve({ account_link }) }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "このGoogleアカウントは別の記録で使われているため",
  );
});
it("不正な連携結果は表示しない", async () => {
  mocks.user.mockResolvedValue({ kind: "guest", sub: "guest" });
  const account_link = "invalid";
  render(await Page({ searchParams: Promise.resolve({ account_link }) }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
