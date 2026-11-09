// @vitest-environment node
import { decodeJwt } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_LINK_AUDIENCE,
  ACCOUNT_LINK_INTENT_COOKIE,
  AccountLinkIntentSchema,
} from "@/contracts/account-link";
import { ROOM_OAUTH_RESUME_COOKIE } from "@/contracts/room-entry";
import { verifyToken } from "@/lib/session/token";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  google: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.set, delete: mocks.delete }),
}));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("./google-authorization", () => ({
  startGoogleAuthorization: mocks.google,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { startGoogleAccountLink } from "./account-link-actions";

const principal = "11111111-1111-4111-8111-111111111111";
const secret = "test-secret-at-least-thirty-two-characters";
const now = 1800000000;
const next = "/rooms?from=guest";
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now * 1000);
  vi.stubEnv("SESSION_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  mocks.user.mockResolvedValue({
    kind: "guest",
    sub: principal,
    email: null,
    exp: now + 3600,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Google連携の開始", () => {
  it.each([3600, 120])(
    "残り%s秒のCookie本人を署名intentにし期限を短い方へ制限する",
    async (remaining) => {
      mocks.user.mockResolvedValue({
        kind: "guest",
        sub: principal,
        email: null,
        exp: now + remaining,
      });
      await startGoogleAccountLink(next);
      expect(mocks.set).toHaveBeenCalledOnce();
      const [name, token, options] = mocks.set.mock.calls[0];
      expect(name).toBe(ACCOUNT_LINK_INTENT_COOKIE);
      expect(options).toMatchObject({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: Math.min(600, remaining),
      });
      const intent = await verifyToken(token, AccountLinkIntentSchema, {
        secret,
        audience: ACCOUNT_LINK_AUDIENCE.intent,
      });
      expect(intent).toMatchObject({
        principal,
        next,
        exp: now + Math.min(600, remaining),
        state: expect.any(String),
        nonce: expect.any(String),
      });
      expect(decodeJwt(token).aud).toBe(ACCOUNT_LINK_AUDIENCE.intent);
      expect(intent?.state).not.toBe(intent?.nonce);
      expect(mocks.delete).toHaveBeenCalledWith(ROOM_OAUTH_RESUME_COOKIE);
      expect(mocks.google).toHaveBeenCalledExactlyOnceWith(
        next,
        intent?.state,
        intent?.nonce,
        "account_link",
      );
      expect(mocks.delete.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.google.mock.invocationCallOrder[0],
      );
    },
  );
  it.each([null, undefined, 42, {}, ["/rooms"], `/${"a".repeat(2048)}`])(
    "不正なnext %jはホームへ置き換えて連携を開始する",
    async (value) => {
      await Reflect.apply(startGoogleAccountLink, undefined, [value]);
      expect(mocks.google).toHaveBeenCalledExactlyOnceWith(
        "/",
        expect.any(String),
        expect.any(String),
        "account_link",
      );
      expect(decodeJwt(mocks.set.mock.calls[0][1]).next).toBe("/");
    },
  );
  it("2048文字のnextは切り詰めずに連携を開始する", async () => {
    const value = `/${"a".repeat(2047)}`;
    await startGoogleAccountLink(value);
    expect(decodeJwt(mocks.set.mock.calls[0][1]).next).toBe(value);
  });
  it.each(["/.//evil.com", "/a/..//evil.com", "/%2e%2e//evil.com"])(
    "account本人の正規化後に危険になるnext %sはホームへ戻す",
    async (value) => {
      mocks.user.mockResolvedValue({
        kind: "account",
        sub: principal,
        email: "a@example.test",
        exp: now + 600,
      });
      await expect(startGoogleAccountLink(value)).rejects.toThrow(
        /^redirect:\/$/,
      );
      expect(mocks.google).not.toHaveBeenCalled();
    },
  );
  it("Google認証の開始へ連携用途を渡す", async () => {
    await startGoogleAccountLink(next);
    expect(mocks.google).toHaveBeenCalledExactlyOnceWith(
      next,
      expect.any(String),
      expect.any(String),
      "account_link",
    );
  });
  it("account本人は連携を開始せず元画面へ戻る", async () => {
    mocks.user.mockResolvedValue({
      kind: "account",
      sub: principal,
      email: "a@example.test",
      exp: now + 600,
    });
    await expect(startGoogleAccountLink(next)).rejects.toThrow(
      `redirect:${next}`,
    );
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.google).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { kind: "guest", sub: principal, email: null, exp: now },
    { kind: "guest", sub: principal, email: null, exp: now - 1 },
  ])("本人なし・期限切れ%jならsession_changedへ戻る", async (user) => {
    mocks.user.mockResolvedValue(user);
    await expect(startGoogleAccountLink(next)).rejects.toThrow(
      `redirect:${next}&account_link=session_changed`,
    );
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.google).not.toHaveBeenCalled();
  });
  it("Google未設定ならunavailableへ戻る", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    await expect(startGoogleAccountLink(next)).rejects.toThrow(
      `redirect:${next}&account_link=unavailable`,
    );
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.google).not.toHaveBeenCalled();
  });
  it("外部URLのnextはホームへ安全化する", async () => {
    await startGoogleAccountLink("https://evil.example/");
    expect(mocks.google).toHaveBeenCalledWith(
      "/",
      expect.any(String),
      expect.any(String),
      "account_link",
    );
    const intent = decodeJwt(mocks.set.mock.calls[0][1]);
    expect(intent.next).toBe("/");
  });
});
