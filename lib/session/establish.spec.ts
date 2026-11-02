// @vitest-environment node
// establishSession はログインフローの中核。api-worker への同期がネットワーク
// 障害や不正 JSON で失敗しても、未処理例外で落とさず ok:false の一貫した
// エラーに畳むこと（呼び出し側の Server Action がエラー表示へ倒せる形）を検証する。

import { decodeJwt } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginAssertion } from "@/contracts/session";

const { apiFetchMock, setSessionCookieMock } = vi.hoisted(() => ({
  apiFetchMock:
    vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(),
  setSessionCookieMock: vi.fn<(token: string) => Promise<void>>(),
}));

vi.mock("@/lib/api-client", () => ({ apiFetch: apiFetchMock }));

vi.mock("@/lib/session/cookie", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/session/cookie")>();
  return {
    ...original,
    setSessionCookie: setSessionCookieMock,
  };
});

import { establishSession } from "@/lib/session/establish";

const ASSERTION: LoginAssertion = {
  kind: "dev",
  userId: "123e4567-e89b-12d3-a456-426614174000",
  email: "dev@example.com",
  name: "Dev User",
};

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "a-sufficiently-long-random-secret-value");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("establishSession", () => {
  it("同期に成功したらセッション Cookie を発行し ok:true を返す", async () => {
    apiFetchMock.mockResolvedValue(
      Response.json({ userId: "123e4567-e89b-12d3-a456-426614174000" }),
    );

    const result = await establishSession(ASSERTION);

    expect(result.ok).toBe(true);
    expect(setSessionCookieMock).toHaveBeenCalledOnce();
  });

  it("新しいセッションは発行から固定7日", async () => {
    apiFetchMock.mockResolvedValue(Response.json({ userId: ASSERTION.userId }));
    await establishSession(ASSERTION);
    const token = setSessionCookieMock.mock.calls[0]?.[0];
    expect(token).toBeTruthy();
    const claims = decodeJwt(token ?? "");
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(7 * 24 * 60 * 60);
  });

  it("apiFetch が例外を投げても ok:false に畳む（ネットワーク障害）", async () => {
    apiFetchMock.mockRejectedValue(new Error("network down"));

    const result = await establishSession(ASSERTION);

    expect(result).toEqual({
      ok: false,
      error: "ユーザー情報の同期に失敗しました。",
    });
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  });

  it("レスポンスが不正 JSON でも ok:false に畳む", async () => {
    apiFetchMock.mockResolvedValue(new Response("<html>error</html>"));

    const result = await establishSession(ASSERTION);

    expect(result).toEqual({
      ok: false,
      error: "ユーザー情報の同期結果が不正です。",
    });
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  });

  it("非 2xx レスポンスは ok:false に畳む", async () => {
    apiFetchMock.mockResolvedValue(
      new Response("unauthorized", { status: 401 }),
    );

    const result = await establishSession(ASSERTION);

    expect(result).toEqual({
      ok: false,
      error: "ユーザー情報の同期に失敗しました。",
    });
  });
});

describe("本人種別に応じたCookie発行", () => {
  it("ゲスト主張ではkind guest・email null・主張と同じsubを発行しnameを含めない", async () => {
    const assertion = {
      kind: "guest",
      userId: ASSERTION.userId,
      displayName: "はな",
    } as const;
    apiFetchMock.mockResolvedValue(Response.json({ userId: assertion.userId }));
    expect((await establishSession(assertion)).ok).toBe(true);
    expect(setSessionCookieMock).toHaveBeenCalledOnce();
    const claims = decodeJwt(setSessionCookieMock.mock.calls[0]?.[0] ?? "");
    expect(claims).toMatchObject({
      kind: "guest",
      email: null,
      sub: assertion.userId,
    });
    expect(claims).not.toHaveProperty("name");
  });
  it.each(["guest", "dev"] as const)(
    "%s主張と同期応答のuserIdが違えば失敗しCookieを発行しない",
    async (kind) => {
      apiFetchMock.mockResolvedValue(
        Response.json({ userId: "22222222-2222-4222-8222-222222222222" }),
      );
      const assertion =
        kind === "dev"
          ? ASSERTION
          : { kind, userId: ASSERTION.userId, displayName: "はな" };
      expect(await establishSession(assertion)).toMatchObject({
        ok: false,
        error: expect.any(String),
      });
      expect(setSessionCookieMock).not.toHaveBeenCalled();
    },
  );
  it.each([
    ASSERTION,
    {
      kind: "google",
      googleSub: "google-sub",
      email: "hana@example.test",
      name: "はな",
    } as const,
  ])(
    "$kind 主張ではkind account・email・nameをCookieへ入れる",
    async (assertion) => {
      apiFetchMock.mockResolvedValue(
        Response.json({ userId: ASSERTION.userId }),
      );
      expect((await establishSession(assertion)).ok).toBe(true);
      expect(
        decodeJwt(setSessionCookieMock.mock.calls[0]?.[0] ?? ""),
      ).toMatchObject({
        kind: "account",
        sub: ASSERTION.userId,
        email: assertion.email,
        name: assertion.name,
      });
    },
  );
});

it("ゲスト本人の同期が503ならCookieを発行しない", async () => {
  apiFetchMock.mockResolvedValue(new Response("同期失敗", { status: 503 }));
  expect(
    await establishSession({
      kind: "guest",
      userId: ASSERTION.userId,
      displayName: "はな",
    }),
  ).toMatchObject({ ok: false, error: expect.any(String) });
  expect(setSessionCookieMock).not.toHaveBeenCalled();
});
