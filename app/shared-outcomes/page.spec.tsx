import { expect, it, vi } from "vitest";

const { getCurrentUser, redirect } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(url);
  }),
}));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser }));
vi.mock("next/navigation", () => ({ redirect }));

import SharedOutcomesPage from "./page";

it("ログイン後も共有された成果と検索条件へ戻れる", async () => {
  getCurrentUser.mockResolvedValue(null);
  const roomId = "123e4567-e89b-42d3-a456-426614174000";
  await expect(
    SharedOutcomesPage({
      searchParams: Promise.resolve({ roomId, q: "受付", status: "confirmed" }),
    }),
  ).rejects.toThrow();
  const next = new URL(
    redirect.mock.calls.at(-1)?.[0] ?? "",
    "https://app.test",
  ).searchParams.get("next");
  const params = new URL(next ?? "", "https://app.test").searchParams;
  expect(params.get("roomId")).toBe(roomId);
  expect(params.get("q")).toBe("受付");
  expect(params.get("status")).toBe("confirmed");
});
