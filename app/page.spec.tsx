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
