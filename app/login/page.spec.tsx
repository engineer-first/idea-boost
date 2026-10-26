import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: async () => null,
}));
vi.mock("@/lib/session/env", () => ({
  isAuthConfigured: () => true,
  isDevAuthEnabled: () => false,
}));

import LoginPage from "./page";

it.each([
  undefined,
  "/",
  "https://evil.example",
  "/invite/ABC123",
  "/shared-outcomes?status=confirmed#results",
])("説明リンクに安全な戻り先を引き継ぐ: %s", async (next) => {
  render(await LoginPage({ searchParams: Promise.resolve({ next }) }));
  const expected =
    !next || next === "/" || next.startsWith("https:")
      ? "/about"
      : `/about?next=${encodeURIComponent(next)}`;
  expect(screen.getByRole("link", { name: "IdeaBoostとは？" })).toHaveAttribute(
    "href",
    expected,
  );
});
