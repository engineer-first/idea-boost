// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOM_OAUTH_RESUME_COOKIE } from "@/contracts/room-entry";
import { OAUTH_STATE_COOKIE } from "@/lib/session/cookie";
import { signToken } from "@/lib/session/token";

const mocks = vi.hoisted(() => ({
  store: new Map<string, string>(),
  delete: vi.fn(),
  fetch: vi.fn(),
  verify: vi.fn(),
  complete: vi.fn(),
  establish: vi.fn(),
  session: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.store.get(name);
      return value ? { value } : undefined;
    },
    delete: mocks.delete,
    set: vi.fn(),
  }),
}));
vi.mock("jose", async (importOriginal) => {
  const original = await importOriginal<typeof import("jose")>();
  return {
    ...original,
    createRemoteJWKSet: vi.fn(),
    jwtVerify: (token: string, ...args: unknown[]) => {
      if (token === "google-id-token") return mocks.verify();
      return Reflect.apply(original.jwtVerify, undefined, [token, ...args]);
    },
  };
});
vi.mock("@/lib/session/establish", () => ({
  establishSession: mocks.establish,
}));
vi.mock("@/features/auth/logic/account-link", () => ({
  completeGoogleAccountLink: mocks.complete,
}));
vi.mock("@/lib/session/cookie", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session/cookie")>()),
  setSessionCookie: mocks.session,
}));

import { GET } from "./route";

const cookieName = "idea_boost_account_link";
const secret = "test-secret-at-least-thirty-two-characters";
const state = "11111111-1111-4111-8111-111111111111";
const nonce = "22222222-2222-4222-8222-222222222222";
const principal = "33333333-3333-4333-8333-333333333333";
const next = "/rooms?from=guest&filter=mine#result";
const claims = {
  sub: "google-sub",
  email: "a@example.test",
  name: "Googleの名前",
  nonce,
  email_verified: true,
};
let intent: {
  principal: string;
  state: string;
  nonce: string;
  next: string;
  exp: number;
};
async function intentCookie(
  overrides = {},
  audience = "idea-boost:account-link-intent",
  expiresInSeconds = 600,
) {
  mocks.store.set(
    cookieName,
    await signToken(
      { ...intent, ...overrides },
      { secret, audience, expiresInSeconds },
    ),
  );
}
function request(query: Record<string, string> = {}) {
  return new NextRequest(
    `http://localhost:19500/auth/callback?${new URLSearchParams({ code: "code", state, ...query })}`,
  );
}
function result(response: Response, code: string, expectedNext = next) {
  expect(response.status).toBe(307);
  const url = new URL(response.headers.get("location") ?? "");
  const expected = new URL(expectedNext, "http://localhost:19500");
  expected.searchParams.set("account_link", code);
  expect(url.href).toBe(expected.href);
  expect(mocks.establish).not.toHaveBeenCalled();
}
beforeEach(async () => {
  vi.resetAllMocks();
  mocks.store.clear();
  vi.stubEnv("SESSION_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://localhost:19500");
  mocks.delete.mockImplementation((name: string) => mocks.store.delete(name));
  mocks.store.set(
    OAUTH_STATE_COOKIE,
    JSON.stringify({ state, nonce, next, purpose: "account_link" }),
  );
  intent = {
    principal,
    state,
    nonce,
    next,
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  await intentCookie();
  mocks.fetch.mockResolvedValue(Response.json({ id_token: "google-id-token" }));
  mocks.verify.mockResolvedValue({ payload: claims });
  mocks.complete.mockResolvedValue("linked");
  mocks.establish.mockResolvedValue({ ok: true, user: { sub: principal } });
  vi.stubGlobal("fetch", mocks.fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Google連携専用callback", () => {
  it("通常ログインを確立せず連携を完了しnextのクエリとhashを保ってlinkedへ戻る", async () => {
    result(await GET(request()), "linked");
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith(intent, {
      sub: claims.sub,
      email: claims.email,
      name: claims.name,
    });
    for (const name of [
      OAUTH_STATE_COOKIE,
      ROOM_OAUTH_RESUME_COOKIE,
      cookieName,
    ])
      expect(mocks.delete).toHaveBeenCalledWith(name);
  });
  it.each(["消失", "期限切れ", "署名不正", "用途不正", "state不一致"])(
    "連携intentが%sでも連携用途のstateから通常ログインへ進まない",
    async (failure) => {
      if (failure === "消失") mocks.store.delete(cookieName);
      if (failure === "期限切れ") await intentCookie({}, undefined, -1);
      if (failure === "署名不正") mocks.store.set(cookieName, "invalid");
      if (failure === "用途不正") await intentCookie({}, "idea-boost:session");
      if (failure === "state不一致")
        await intentCookie({ state: crypto.randomUUID() });
      result(await GET(request()), "failed", "/home");
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.complete).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );
  it("一致する連携intentがあってもOAuthに連携用途がなければ拒否する", async () => {
    mocks.store.set(OAUTH_STATE_COOKIE, JSON.stringify({ state, nonce, next }));
    result(await GET(request()), "failed", "/home");
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("codeなしの取消しはcancelledへ戻しCookieを発行しない", async () => {
    const input = request({ error: "access_denied" });
    input.nextUrl.searchParams.delete("code");
    result(await GET(input), "cancelled");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each([
    "queryのstate不一致",
    "oauthのstate不一致",
    "oauthのnonce不一致",
    "oauthなし",
  ])("%sはホームのfailedへ戻す", async (failure) => {
    const input = request();
    if (failure === "queryのstate不一致")
      input.nextUrl.searchParams.set("state", crypto.randomUUID());
    if (failure === "oauthのstate不一致")
      mocks.store.set(
        OAUTH_STATE_COOKIE,
        JSON.stringify({ state: crypto.randomUUID(), nonce, next }),
      );
    if (failure === "oauthのnonce不一致")
      mocks.store.set(
        OAUTH_STATE_COOKIE,
        JSON.stringify({ state, nonce: crypto.randomUUID(), next }),
      );
    if (failure === "oauthなし") mocks.store.delete(OAUTH_STATE_COOKIE);
    result(await GET(input), "failed", "/home");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each([
    "トークン交換失敗",
    "通信例外",
    "id_token検証失敗",
    "nonce不一致",
    "email未確認",
  ])("%sはfailedへ戻しセッションを発行しない", async (failure) => {
    if (failure === "トークン交換失敗")
      mocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));
    if (failure === "通信例外")
      mocks.fetch.mockRejectedValue(new Error("通信失敗"));
    if (failure === "id_token検証失敗")
      mocks.verify.mockRejectedValue(new Error("署名不正"));
    if (failure === "nonce不一致")
      mocks.verify.mockResolvedValue({
        payload: { ...claims, nonce: "不一致" },
      });
    if (failure === "email未確認")
      mocks.verify.mockResolvedValue({
        payload: { ...claims, email_verified: false },
      });
    result(await GET(request()), "failed");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each([
    "google_account_in_use",
    "already_linked",
    "session_changed",
    "failed",
  ])("連携処理の結果%sを元画面へ返す", async (code) => {
    mocks.complete.mockResolvedValue(code);
    result(await GET(request()), code);
  });
  it("intentの外部URLを安全化してホームへ戻す", async () => {
    await intentCookie({ next: "https://evil.example/" });
    result(await GET(request()), "linked", "/");
  });
  it("別stateの古い連携intentは最新の通常ログインを妨げず消費される", async () => {
    await intentCookie({ state: crypto.randomUUID() });
    mocks.store.set(OAUTH_STATE_COOKIE, JSON.stringify({ state, nonce, next }));
    const response = await GET(request());
    expect(response.headers.get("location")).toBe(
      `http://localhost:19500${next}`,
    );
    expect(mocks.establish).toHaveBeenCalledExactlyOnceWith({
      kind: "google",
      googleSub: claims.sub,
      email: claims.email,
      name: claims.name,
    });
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalledWith(cookieName);
    expect(mocks.store.has(cookieName)).toBe(false);
  });
});
