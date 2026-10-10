// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: true,
  cookie: undefined as string | undefined,
  deleteCookie: vi.fn(),
  setCookie: vi.fn(),
  redirect: vi.fn(),
  fetch: vi.fn(),
  verify: vi.fn(),
  establish: vi.fn(),
  jwks: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name !== "idea_boost_oauth" || mocks.cookie === undefined
        ? undefined
        : { value: mocks.cookie },
    delete: mocks.deleteCookie,
    set: mocks.setCookie,
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/session/env", () => ({
  isGoogleAuthConfigured: () => mocks.configured,
  getGoogleClientId: () => "test-client-id",
  getGoogleClientSecret: () => "test-client-secret",
  getBaseUrl: () => "http://localhost:19500",
}));
vi.mock("jose", () => ({
  createRemoteJWKSet: () => mocks.jwks,
  jwtVerify: mocks.verify,
}));
vi.mock("@/lib/session/establish", () => ({
  establishSession: mocks.establish,
}));

import { signInWithGoogle } from "@/features/auth";
import { GET } from "./route";

const cookieName = "idea_boost_oauth";
const safeCookieNext = "/invite/ABC234?from=team#confirm";
const validClaims = {
  sub: "google-test-subject",
  email: "member@example.test",
  email_verified: true,
  name: "Member",
  nonce: "matching-nonce",
};
function setCookie(next = safeCookieNext): void {
  mocks.cookie = JSON.stringify({
    state: "matching-state",
    nonce: "matching-nonce",
    next,
  });
}
function request(query: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost:19500/auth/callback");
  url.search = new URLSearchParams({
    code: "test-code",
    state: "matching-state",
    next: "//evil.example/request",
    ...query,
  }).toString();
  return new NextRequest(url);
}
function assertLogin(
  response: Response,
  expectedNext: string | null = safeCookieNext,
): URL {
  expect(response.status).toBe(307);
  const location = new URL(response.headers.get("location") as string);
  expect(location.origin).toBe("http://localhost:19500");
  expect(location.pathname).toBe("/login");
  expect(location.searchParams.get("next")).toBe(expectedNext);
  expect(location.searchParams.get("error")).toBeTruthy();
  expect([...location.searchParams.keys()].sort()).toEqual(
    expectedNext === null ? ["error"] : ["error", "next"],
  );
  expect(mocks.deleteCookie).toHaveBeenCalledWith(cookieName);
  return location;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.configured = true;
  setCookie();
  mocks.deleteCookie.mockImplementation(() => {
    mocks.cookie = undefined;
  });
  mocks.setCookie.mockImplementation((_name: string, value: string) => {
    mocks.cookie = value;
  });
  mocks.redirect.mockImplementation(() => {
    throw new Error("redirect to Google");
  });
  mocks.fetch.mockResolvedValue(Response.json({ id_token: "test-id-token" }));
  mocks.verify.mockResolvedValue({ payload: validClaims });
  mocks.establish.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", mocks.fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Google callback失敗後の再試行先", () => {
  it.each([
    "token HTTP失敗",
    "fetch reject",
    "JSON読取失敗",
    "id_token欠落",
  ])("%sは同じcookieのnextへ戻し、検証やセッション確立をしない", async (failure) => {
    if (failure === "token HTTP失敗")
      mocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));
    if (failure === "fetch reject")
      mocks.fetch.mockRejectedValue(new Error("network failed"));
    if (failure === "JSON読取失敗")
      mocks.fetch.mockResolvedValue(new Response("invalid JSON"));
    if (failure === "id_token欠落")
      mocks.fetch.mockResolvedValue(Response.json({}));
    const response = await GET(request());
    assertLogin(response);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.establish).not.toHaveBeenCalled();
  });

  it.each([
    "署名検証失敗",
    "claims不正",
    "nonce不一致",
    "メール未検証",
    "メール検証claim欠落",
  ])("%sは認証を拒否し、state照合済みのnextだけ保持する", async (failure) => {
    if (failure === "署名検証失敗")
      mocks.verify.mockRejectedValue(
        new Error("signature verification failed"),
      );
    if (failure === "claims不正")
      mocks.verify.mockResolvedValue({
        payload: { ...validClaims, email: "invalid" },
      });
    if (failure === "nonce不一致")
      mocks.verify.mockResolvedValue({
        payload: { ...validClaims, nonce: "wrong-nonce" },
      });
    if (failure === "メール未検証")
      mocks.verify.mockResolvedValue({
        payload: { ...validClaims, email_verified: false },
      });
    if (failure === "メール検証claim欠落")
      mocks.verify.mockResolvedValue({
        payload: { ...validClaims, email_verified: undefined },
      });
    assertLogin(await GET(request()));
    expect(mocks.establish).not.toHaveBeenCalled();
  });

  it.each([
    "失敗結果",
    "throw",
  ])("セッション確立の%sでも成功を偽らず再試行先に戻す", async (failure) => {
    if (failure === "失敗結果")
      mocks.establish.mockResolvedValue({
        ok: false,
        error: "ユーザー情報の同期に失敗しました。",
      });
    else mocks.establish.mockRejectedValue(new Error("session failed"));
    const location = assertLogin(await GET(request()));
    if (failure === "失敗結果")
      expect(location.searchParams.get("error")).toBe(
        "ユーザー情報の同期に失敗しました。",
      );
    expect(mocks.establish).toHaveBeenCalledTimes(1);
  });

  it("有効stateの取消・code欠落はcookieを消費してnext付きloginへ戻り、交換もセッション確立もしない", async () => {
    const cancelled = request({ error: "access_denied" });
    cancelled.nextUrl.searchParams.delete("code");
    assertLogin(await GET(cancelled));
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.establish).not.toHaveBeenCalled();
  });
});

describe("未検証の戻り先を信用しない", () => {
  it.each([
    "state欠落",
    "state不一致",
    "cookie欠落",
    "壊れたJSON",
    "schema不正",
  ])("%sならcookie/requestのnextを使わず認証を拒否する", async (failure) => {
    const input = request({ next: safeCookieNext });
    if (failure === "state欠落") input.nextUrl.searchParams.delete("state");
    if (failure === "state不一致")
      input.nextUrl.searchParams.set("state", "wrong-state");
    if (failure === "cookie欠落") mocks.cookie = undefined;
    if (failure === "壊れたJSON") mocks.cookie = "{";
    if (failure === "schema不正")
      mocks.cookie = JSON.stringify({
        state: "matching-state",
        next: safeCookieNext,
      });
    assertLogin(await GET(input), null);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.establish).not.toHaveBeenCalled();
  });

  it("環境未設定ではnextを復元せずGoogle通信やセッション確立を行わない", async () => {
    mocks.configured = false;
    const response = await GET(request({ next: safeCookieNext }));
    const location = new URL(response.headers.get("location") as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.establish).not.toHaveBeenCalled();
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "/\n/evil.example",
    "https%3A%2F%2Fevil.example",
  ])("cookieの危険なnext %sも安全なloginに戻す", async (next) => {
    setCookie(next);
    mocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));
    assertLogin(await GET(request()), null);
    expect(mocks.establish).not.toHaveBeenCalled();
  });

  it.each([
    safeCookieNext,
    "/invite/ABC234?from=team%26other%3D1#confirm",
    "/invite/ABC234?next=https://evil.example#//evil.example",
    "/%2F%2Fevil.example",
  ])("query/hash/encodeを持つ内部next %sを外部URLに変換せず保持する", async (next) => {
    setCookie(next);
    mocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));
    assertLogin(await GET(request()), next);
  });

  it("一度消費したcookieを再利用せず、次回は戻り先も復元しない", async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));
    assertLogin(await GET(request()));
    const second = new URL(
      (await GET(request())).headers.get("location") as string,
    );
    expect(second.pathname).toBe("/login");
    expect(second.searchParams.get("next")).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(
      mocks.deleteCookie.mock.calls.filter(([name]) => name === cookieName),
    ).toHaveLength(2);
    expect(mocks.establish).not.toHaveBeenCalled();
  });
});

it("成功は従来の検証設定と入力形で一度だけセッションを確立し、安全なcookie nextへ戻る", async () => {
  const response = await GET(request());
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(
    `http://localhost:19500${safeCookieNext}`,
  );
  expect(mocks.deleteCookie).toHaveBeenCalledWith(cookieName);
  expect(mocks.verify).toHaveBeenCalledExactlyOnceWith(
    "test-id-token",
    mocks.jwks,
    {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: "test-client-id",
    },
  );
  expect(mocks.establish).toHaveBeenCalledExactlyOnceWith({
    kind: "google",
    googleSub: validClaims.sub,
    email: validClaims.email,
    name: validClaims.name,
  });
  const [endpoint, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
  expect(endpoint).toBe("https://oauth2.googleapis.com/token");
  expect(init.method).toBe("POST");
  expect(
    new URLSearchParams(init.body as URLSearchParams).get("grant_type"),
  ).toBe("authorization_code");
});

it("失敗で消費したstate/nonceを再試行に流用せず、既存Google actionが新しく発行する", async () => {
  mocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));
  assertLogin(await GET(request()));
  await expect(signInWithGoogle(safeCookieNext)).rejects.toThrow(
    "redirect to Google",
  );
  const first = JSON.parse(mocks.cookie as string) as {
    state: string;
    nonce: string;
    next: string;
  };
  expect(first.next).toBe(safeCookieNext);
  expect(first.state).not.toBe("matching-state");
  expect(first.nonce).not.toBe("matching-nonce");
  await expect(signInWithGoogle(safeCookieNext)).rejects.toThrow(
    "redirect to Google",
  );
  const second = JSON.parse(mocks.cookie as string) as {
    state: string;
    nonce: string;
    next: string;
  };
  expect(second.state).not.toBe(first.state);
  expect(second.nonce).not.toBe(first.nonce);
  expect(mocks.setCookie).toHaveBeenCalledWith(
    cookieName,
    expect.any(String),
    expect.objectContaining({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    }),
  );
  expect(mocks.establish).not.toHaveBeenCalled();
});
