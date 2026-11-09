// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAUTH_STATE_COOKIE } from "@/lib/session/cookie";

const mocks = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set }) }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("認証画面へ遷移");
  },
}));
vi.mock("@/lib/session/env", () => ({
  getBaseUrl: () => "https://example.test",
  getGoogleClientId: () => "client",
}));

import { startGoogleAuthorization } from "./google-authorization";

beforeEach(() => vi.clearAllMocks());
describe("Google認証の用途Cookie", () => {
  it.each([undefined, "account_link"] as const)(
    "用途%sを省略時の互換性を保ってCookieへ保存する",
    async (purpose) => {
      await expect(
        startGoogleAuthorization("/rooms", "state", "nonce", purpose),
      ).rejects.toThrow("認証画面へ遷移");
      const [name, value] = mocks.set.mock.calls[0];
      expect(name).toBe(OAUTH_STATE_COOKIE);
      expect(JSON.parse(value)).toEqual({
        state: "state",
        nonce: "nonce",
        next: "/rooms",
        ...(purpose ? { purpose } : {}),
      });
    },
  );
});
