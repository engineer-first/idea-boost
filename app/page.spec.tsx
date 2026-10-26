import { render, screen } from "@testing-library/react";
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
  expect(
    screen.getAllByRole("link", { name: "Googleでログインして始める" })[0],
  ).toHaveAttribute("href", "/login?next=%2Fhome");
});

it("ログイン済みでRootPageを開くとホームへ直行する", async () => {
  mocks.user.mockResolvedValue({ sub: "user" });
  await expect(RootPage()).rejects.toThrow("redirect:/home");
  expect(mocks.headers).toHaveBeenCalled();
});
