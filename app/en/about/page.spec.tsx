import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("next/headers", () => ({
  // 日本語のブラウザで開き、日本語版への案内も出す。
  headers: async () => new Headers({ "accept-language": "ja-JP" }),
}));

import EnglishAboutPage from "./page";

it.each([false, true])(
  "ログイン状態=%sでも英語の説明を表示し、開始リンクが招待先を保持する",
  async (loggedIn) => {
    mocks.user.mockResolvedValue(loggedIn ? { sub: "user" } : null);
    render(
      await EnglishAboutPage({
        searchParams: Promise.resolve({ next: "/invite/ABC123" }),
      }),
    );
    expect(screen.getByRole("main")).toHaveAttribute("lang", "en");
    const links = screen.getAllByRole("link", {
      name: /invitation/i,
    });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links)
      expect(link).toHaveAttribute("href", "/invite/ABC123");
    const header = screen.getByRole("banner");
    expect(within(header).getByText("Idea Boost")).toBeInTheDocument();
    if (!loggedIn) {
      expect(
        within(header).getByRole("link", { name: "Log in" }),
      ).toHaveAttribute("href", "/login?next=%2Finvite%2FABC123");
      expect(
        within(header).getByRole("link", { name: "日本語" }),
      ).toHaveAttribute("href", "/");
    } else {
      expect(
        within(header).getByRole("link", { name: "Home" }),
      ).toHaveAttribute("href", "/home");
      // ログイン中の / はホームへ転送されるので、言語の切替は説明ページどうしで行う。
      expect(
        within(header).getByRole("link", { name: "日本語" }),
      ).toHaveAttribute("href", "/about");
    }
  },
);
