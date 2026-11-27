// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAUTH_STATE_COOKIE } from "@/lib/session/cookie";

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  redirect: vi.fn(),
  baseUrl: "https://example.test",
  host: "example.test",
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.set }),
  headers: async () => new Headers({ host: mocks.host }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mocks.redirect(url);
    throw new Error("遷移");
  },
}));
vi.mock("@/lib/session/env", () => ({
  getBaseUrl: () => mocks.baseUrl,
  getGoogleClientId: () => "client",
}));

import {
  localGoogleRedirectIssue,
  startGoogleAuthorization,
} from "./google-authorization";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.baseUrl = "https://example.test";
  mocks.host = "example.test";
});
describe("Google認証の用途Cookie", () => {
  it.each([undefined, "account_link"] as const)(
    "用途%sを省略時の互換性を保ってCookieへ保存する",
    async (purpose) => {
      await expect(
        startGoogleAuthorization("/rooms", "state", "nonce", purpose),
      ).rejects.toThrow("遷移");
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

describe("ローカル開発のGoogle認証開始", () => {
  it("開いているポートとSITE_URLのポートが違えば、理由を返し、開始してもCookieを書かずに止める", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.baseUrl = "http://localhost:3000";
    mocks.host = "localhost:3001";
    expect(await localGoogleRedirectIssue()).toContain("worktree");
    await expect(
      startGoogleAuthorization("/rooms", "state", "nonce"),
    ).rejects.toThrow("worktree");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("登録範囲内のポートで、SITE_URLと同じURLで開けばGoogleへ送る", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.baseUrl = "http://localhost:3001";
    mocks.host = "localhost:3001";
    await expect(
      startGoogleAuthorization("/rooms", "state", "nonce"),
    ).rejects.toThrow("遷移");
    const url = new URL(mocks.redirect.mock.calls[0][0]);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3001/auth/callback",
    );
  });

  it("本番ではHostとSITE_URLが違っても止めずにGoogleへ送る", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.baseUrl = "https://ideaboost.dev";
    mocks.host = "other.example";
    expect(await localGoogleRedirectIssue()).toBeNull();
    await expect(
      startGoogleAuthorization("/rooms", "state", "nonce"),
    ).rejects.toThrow("遷移");
    expect(new URL(mocks.redirect.mock.calls[0][0]).origin).toBe(
      "https://accounts.google.com",
    );
  });
});
