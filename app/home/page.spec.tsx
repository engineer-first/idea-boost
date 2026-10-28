import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { HomeView } from "./home-view";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  homeView: vi.fn(),
}));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/session/env", () => ({
  isAuthConfigured: () => true,
  isDevAuthEnabled: () => false,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./home-view", () => ({
  HomeView: (props: ComponentProps<typeof HomeView>) => {
    mocks.homeView(props);
    return <div data-testid="home-view" />;
  },
}));

import HomePage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue(null);
});

it("認証設定があり本人がいなくてもリダイレクトせずホームを描画する", async () => {
  render(await HomePage({ searchParams: Promise.resolve({}) }));
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(screen.getByTestId("home-view")).toBeInTheDocument();
  expect(mocks.homeView).toHaveBeenCalledWith(
    expect.objectContaining({ currentUserId: undefined }),
  );
});

it("本人がいる場合はその利用者IDをホームへ渡す", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  mocks.user.mockResolvedValue({ sub: userId });
  render(await HomePage({ searchParams: Promise.resolve({}) }));
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(screen.getByTestId("home-view")).toBeInTheDocument();
  expect(mocks.homeView).toHaveBeenCalledWith(
    expect.objectContaining({ currentUserId: userId }),
  );
});
