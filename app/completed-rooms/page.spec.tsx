import { render, screen } from "@testing-library/react";
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
  CompletedRooms: () => <div>一覧コンテナ</div>,
}));

import Page from "./page";

beforeEach(() => vi.clearAllMocks());
it("ゲスト本人は成果コンテナを描画する", async () => {
  mocks.user.mockResolvedValue({ kind: "guest", sub: "guest", email: null });
  render(await Page());
  expect(screen.getByText(/一覧コンテナ/)).toBeVisible();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("本人情報が無いときは自動遷移せず説明とホーム・任意ログインの導線を表示する", async () => {
  mocks.user.mockResolvedValue(null);
  render(await Page());
  expect(mocks.redirect).not.toHaveBeenCalled();
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
    `/login?next=${encodeURIComponent("/completed-rooms")}`,
  );
});
