import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), headers: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

import RootPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue(null);
  mocks.headers.mockResolvedValue(new Headers({ "accept-language": "ja-JP" }));
});

it("英語を優先するブラウザでも / は日本語のまま表示し、英語版への案内だけを出す", async () => {
  mocks.headers.mockResolvedValue(
    new Headers({ "accept-language": "en-US,en;q=0.9" }),
  );
  render(await RootPage());
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "良いアイデアは、",
  );
  const english = within(screen.getByRole("banner")).getByRole("link", {
    name: "English",
  });
  expect(english).toHaveAttribute("href", "/en");
  expect(english).toHaveAttribute("hreflang", "en");
  expect(english).toHaveAttribute("lang", "en");
});

it("日本語のブラウザと言語を送らない取得には英語版への案内を出さない", async () => {
  for (const headers of [
    new Headers({ "accept-language": "ja-JP" }),
    new Headers(),
  ]) {
    mocks.headers.mockResolvedValue(headers);
    const { unmount } = render(await RootPage());
    expect(
      screen.queryByRole("link", { name: "English" }),
    ).not.toBeInTheDocument();
    unmount();
  }
});

it("未ログインでRootPageを開くとリダイレクトせずLPから利用開始できる", async () => {
  render(await RootPage());
  for (const link of screen.getAllByRole("link", { name: "無料で始める" })) {
    expect(link).toHaveAttribute("href", "/login?next=%2Fhome");
  }
});

it("ログイン済みでRootPageを開くとホームへ直行する", async () => {
  mocks.user.mockResolvedValue({ sub: "user" });
  await expect(RootPage()).rejects.toThrow("redirect:/home");
  expect(mocks.headers).toHaveBeenCalled();
});

it("未ログインのLPヘッダーにホームへ戻るログイン入口を残す", async () => {
  render(await RootPage());
  expect(
    within(screen.getByRole("banner")).getByRole("link", { name: "ログイン" }),
  ).toHaveAttribute("href", "/login?next=%2Fhome");
});
