import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "accept-language": "en-US" }),
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
  },
);
