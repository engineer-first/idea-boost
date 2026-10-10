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
