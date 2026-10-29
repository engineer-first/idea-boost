import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock("@/features/completed-rooms", async (original) => ({
  ...(await original<typeof import("@/features/completed-rooms")>()),
  CompletedRooms: ({ accountLink }: { accountLink?: ReactNode }) => (
    <div>一覧コンテナ{accountLink}</div>
  ),
  CompletedRoomDetail: ({
    roomId,
    accountLink,
  }: {
    roomId: string;
    accountLink?: ReactNode;
  }) => (
    <div>
      詳細コンテナ {roomId}
      {accountLink}
    </div>
  ),
}));

import Page from "./page";

const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => vi.clearAllMocks());
it("ゲスト本人は成果コンテナを描画する", async () => {
  mocks.user.mockResolvedValue({ kind: "guest", sub: "guest", email: null });
  render(
    await Page({
      searchParams: Promise.resolve({}),
      params: Promise.resolve({ id }),
    }),
  );
  expect(screen.getByText(/詳細コンテナ/)).toBeVisible();
  expect(
    screen.getByRole("button", {
      name: "Googleと連携して、別の端末からも記録を見返す",
    }),
  ).toBeVisible();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("本人情報が無いときは自動遷移せず説明とホーム・任意ログインの導線を表示する", async () => {
  mocks.user.mockResolvedValue(null);
  render(
    await Page({
      searchParams: Promise.resolve({}),
      params: Promise.resolve({ id }),
    }),
  );
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
  expect(screen.getByRole("link", { name: "ホームへ" })).toHaveAttribute(
    "href",
    "/home",
  );
  expect(
    screen.getByRole("link", {
      name: "Googleでログインして使っていた場合はこちら",
    }),
  ).toHaveAttribute(
    "href",
    `/login?next=${encodeURIComponent(`/completed-rooms/${id}`)}`,
  );
});
it("不正IDは本人情報が無くてもnotFoundにする", async () => {
  mocks.user.mockResolvedValue(null);
  await expect(
    Page({
      searchParams: Promise.resolve({}),
      params: Promise.resolve({ id: "invalid" }),
    }),
  ).rejects.toThrow("notFound");
  expect(mocks.user).not.toHaveBeenCalled();
});

it("アカウント本人には連携済み表示を出して連携ボタンを出さない", async () => {
  mocks.user.mockResolvedValue({ kind: "account", sub: "account" });
  render(
    await Page({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({}),
    }),
  );
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
  render(
    await Page({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({ account_link }),
    }),
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "このGoogleアカウントは別の記録で使われているため",
  );
});
it("不正な連携結果は表示しない", async () => {
  mocks.user.mockResolvedValue({ kind: "guest", sub: "guest" });
  const account_link = "invalid";
  render(
    await Page({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({ account_link }),
    }),
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
