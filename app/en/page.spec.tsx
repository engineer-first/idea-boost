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

import EnglishRootPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue(null);
  mocks.headers.mockResolvedValue(
    new Headers({ "accept-language": "en-US,en;q=0.9" }),
  );
});

it("/en はブラウザの言語によらず英語のLPを英語として表示する", async () => {
  for (const headers of [
    new Headers({ "accept-language": "en-US" }),
    new Headers({ "accept-language": "ja-JP" }),
    new Headers(),
  ]) {
    mocks.headers.mockResolvedValue(headers);
    const { unmount } = render(await EnglishRootPage());
    expect(screen.getByRole("main")).toHaveAttribute("lang", "en");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Great ideas",
    );
    for (const link of screen.getAllByRole("link", {
      name: "Start for free",
    })) {
      expect(link).toHaveAttribute("href", "/login?next=%2Fhome");
    }
    unmount();
  }
});

it("日本語を優先するブラウザで /en を開くと日本語版への案内を出す", async () => {
  mocks.headers.mockResolvedValue(new Headers({ "accept-language": "ja-JP" }));
  render(await EnglishRootPage());
  const japanese = within(screen.getByRole("banner")).getByRole("link", {
    name: "日本語",
  });
  expect(japanese).toHaveAttribute("href", "/");
  expect(japanese).toHaveAttribute("hreflang", "ja");
  expect(japanese).toHaveAttribute("lang", "ja");
});

it("ログイン済みで /en を開くとホームへ直行する", async () => {
  mocks.user.mockResolvedValue({ sub: "user" });
  await expect(EnglishRootPage()).rejects.toThrow("redirect:/home");
});
