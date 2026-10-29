// @vitest-environment node
import { decodeJwt } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_LINK_AUDIENCE,
  AccountLinkAssertionSchema,
} from "@/contracts/account-link";
import { SESSION_TTL_SECONDS } from "@/lib/session/cookie";
import { verifyToken } from "@/lib/session/token";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  api: vi.fn(),
  cookie: vi.fn(),
}));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));
vi.mock("@/lib/session/cookie", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session/cookie")>()),
  setSessionCookie: mocks.cookie,
}));

import { completeGoogleAccountLink } from "./account-link";

const principal = "11111111-1111-4111-8111-111111111111";
const secret = "test-secret-at-least-thirty-two-characters";
const intent = {
  principal,
  state: principal,
  nonce: principal,
  next: "/rooms",
  exp: 1800000600,
};
const claims = {
  sub: "google-sub",
  email: "a@example.test",
  name: "Googleの名前",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(1800000000000);
  vi.stubEnv("SESSION_SECRET", secret);
  mocks.user.mockResolvedValue({
    kind: "guest",
    sub: principal,
    email: null,
    exp: intent.exp,
  });
  mocks.api.mockResolvedValue(Response.json({ ok: true, userId: principal }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Google連携の完了", () => {
  it("60秒の専用主張をWorkerへ送り元のsubを保ったaccount Cookieを7日間発行する", async () => {
    expect(await completeGoogleAccountLink(intent, claims)).toBe("linked");
    expect(mocks.api).toHaveBeenCalledOnce();
    const [path, init] = mocks.api.mock.calls[0];
    expect(path).toBe("/api/auth/link-google");
    expect(init).toMatchObject({ method: "POST" });
    const { assertion } = JSON.parse(init.body);
    expect(
      await verifyToken(assertion, AccountLinkAssertionSchema, {
        secret,
        audience: ACCOUNT_LINK_AUDIENCE.assertion,
      }),
    ).toEqual({
      principal,
      googleSub: claims.sub,
      email: claims.email,
      name: claims.name,
    });
    const signed = decodeJwt(assertion);
    expect((signed.exp ?? 0) - (signed.iat ?? 0)).toBe(60);
    expect(mocks.cookie).toHaveBeenCalledOnce();
    const session = decodeJwt(mocks.cookie.mock.calls[0][0]);
    expect(session).toMatchObject({
      kind: "account",
      sub: principal,
      email: claims.email,
      name: claims.name,
      aud: "idea-boost:session",
    });
    expect((session.exp ?? 0) - (session.iat ?? 0)).toBe(SESSION_TTL_SECONDS);
  });
  it.each([
    null,
    { kind: "guest", sub: "22222222-2222-4222-8222-222222222222", email: null },
    { kind: "account", sub: principal, email: claims.email },
  ])(
    "現在の本人%jが同じゲストでなければWorkerもCookie発行も行わない",
    async (user) => {
      mocks.user.mockResolvedValue(user);
      expect(await completeGoogleAccountLink(intent, claims)).toBe(
        "session_changed",
      );
      expect(mocks.api).not.toHaveBeenCalled();
      expect(mocks.cookie).not.toHaveBeenCalled();
    },
  );
  it.each(["google_account_in_use", "already_linked", "not_guest"])(
    "409の%sではCookieを発行しない",
    async (reason) => {
      mocks.api.mockResolvedValue(
        Response.json({ ok: false, reason }, { status: 409 }),
      );
      // Workerのnot_guestは画面向けのsession_changedへ変換する。
      expect(await completeGoogleAccountLink(intent, claims)).toBe(
        reason === "not_guest" ? "session_changed" : reason,
      );
      expect(mocks.cookie).not.toHaveBeenCalled();
    },
  );
  it.each([
    "通信例外",
    "JSON不正",
    "応答の形が不正",
    "userId不一致",
    "HTTP失敗",
    "未知reason",
  ])("%sはfailedにしてCookieを発行しない", async (failure) => {
    if (failure === "通信例外")
      mocks.api.mockRejectedValue(new Error("通信失敗"));
    if (failure === "JSON不正") mocks.api.mockResolvedValue(new Response("{"));
    if (failure === "応答の形が不正")
      mocks.api.mockResolvedValue(Response.json({ userId: principal }));
    if (failure === "userId不一致")
      mocks.api.mockResolvedValue(
        Response.json({
          ok: true,
          userId: "22222222-2222-4222-8222-222222222222",
        }),
      );
    if (failure === "HTTP失敗")
      mocks.api.mockResolvedValue(new Response(null, { status: 503 }));
    if (failure === "未知reason")
      mocks.api.mockResolvedValue(
        Response.json({ ok: false, reason: "未知" }, { status: 409 }),
      );
    expect(await completeGoogleAccountLink(intent, claims)).toBe("failed");
    expect(mocks.cookie).not.toHaveBeenCalled();
  });
});
