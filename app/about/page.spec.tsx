import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));

import AboutPage from "./page";

it.each([false, true])(
  "ログイン状態=%sでも説明を表示し、すべての開始リンクが招待先を保持する",
  async (loggedIn) => {
    mocks.user.mockResolvedValue(loggedIn ? { sub: "user" } : null);
    render(
      await AboutPage({
        searchParams: Promise.resolve({ next: "/invite/ABC123" }),
      }),
    );
    const href = loggedIn ? "/invite/ABC123" : "/login?next=%2Finvite%2FABC123";
    const label = loggedIn
      ? "招待の参加確認へ進む"
      : "ログインして招待の参加確認へ";
    expect(screen.getAllByRole("link", { name: label })).toHaveLength(2);
    for (const link of screen.getAllByRole("link", { name: label }))
      expect(link).toHaveAttribute("href", href);
    expect(
      within(screen.getByRole("contentinfo")).getByRole("link", {
        name: label,
      }),
    ).toHaveAttribute("href", href);
    expect(
      screen.queryByRole("link", { name: "招待コードをお持ちの方" }),
    ).not.toBeInTheDocument();
    if (!loggedIn)
      expect(screen.getByRole("link", { name: "ログイン" })).toHaveAttribute(
        "href",
        href,
      );
    else expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  },
);
it("nextが複数指定された場合は通常開始に戻す", async () => {
  mocks.user.mockResolvedValue(null);
  render(
    await AboutPage({
      searchParams: Promise.resolve({ next: ["/invite/ABC123", "/about"] }),
    }),
  );
  expect(
    screen.getByRole("link", { name: "招待コードをお持ちの方" }),
  ).toHaveAttribute("href", "/login?next=%2Fhome");
});
