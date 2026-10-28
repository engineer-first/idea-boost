// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOM_ENTRY_MIN_SECONDS } from "@/contracts/room-entry";
import {
  SESSION_COOKIE_NAME,
  TOKEN_AUDIENCE,
  type VerifiedSession,
  VerifiedSessionSchema,
} from "@/contracts/session";
import { SESSION_TTL_SECONDS } from "./cookie";
import { prepareRoomEntrySession } from "./room-entry-session";
import { signToken, verifyToken } from "./token";

const mocks = vi.hoisted(() => ({
  api: vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(),
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mocks.get, set: mocks.set })),
}));

const NOW = 1_800_000_000;
const SECRET = "guest-refresh-test-secret-at-least-32-bytes";
const GUEST: VerifiedSession = {
  kind: "guest",
  sub: "11111111-1111-4111-8111-111111111111",
  email: null,
  exp: NOW + ROOM_ENTRY_MIN_SECONDS - 1,
};
const ACCOUNT: VerifiedSession = {
  ...GUEST,
  kind: "account",
  email: "hana@example.test",
};

async function currentCookie(user: VerifiedSession | null) {
  mocks.get.mockReturnValue(
    user === null
      ? undefined
      : {
          value: await signToken(user, {
            secret: SECRET,
            audience: TOKEN_AUDIENCE.session,
            expiresInSeconds: user.exp - NOW,
          }),
        },
  );
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW * 1000);
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("PREVIEW_ENABLED", "false");
  vi.resetAllMocks();
  await currentCookie(GUEST);
  mocks.api.mockResolvedValue(Response.json({ userId: GUEST.sub }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("入室前のゲストセッション準備", () => {
  it("残り5時間ちょうどなら本人をそのまま返しWorkerもCookieも変更しない", async () => {
    const user = { ...GUEST, exp: NOW + ROOM_ENTRY_MIN_SECONDS };
    expect(await prepareRoomEntrySession(user, NOW)).toEqual({
      ok: true,
      user,
    });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("残り5時間−1秒なら同じゲストの7日Cookieを発行し更新後のexpを返す", async () => {
    expect(await prepareRoomEntrySession(GUEST, NOW)).toEqual({
      ok: true,
      user: { ...GUEST, exp: NOW + SESSION_TTL_SECONDS },
    });
    expect(mocks.api).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenCalledWith("/api/auth/guest/refresh", {
      method: "POST",
    });
    expect(mocks.get).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
    expect(mocks.set).toHaveBeenCalledOnce();
    const [name, token, options] = mocks.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE_NAME);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    expect(
      await verifyToken(token, VerifiedSessionSchema, {
        secret: SECRET,
        audience: TOKEN_AUDIENCE.session,
      }),
    ).toEqual({ ...GUEST, exp: NOW + SESSION_TTL_SECONDS });
  });

  it("accountの残り5時間−1秒は再認証を要求しWorkerを呼ばずCookieを書かない", async () => {
    expect(await prepareRoomEntrySession(ACCOUNT, NOW)).toEqual({
      ok: false,
      reason: "reauth_required",
    });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 409])(
    "更新APIが%sなら本人確認不可を返しCookieを書かない",
    async (status) => {
      mocks.api.mockResolvedValue(new Response(null, { status }));
      expect(await prepareRoomEntrySession(GUEST, NOW)).toEqual({
        ok: false,
        reason: "identity_unavailable",
      });
      expect(mocks.set).not.toHaveBeenCalled();
    },
  );

  it("応答のuserIdが違えば本人確認不可を返しCookieを書かない", async () => {
    mocks.api.mockResolvedValue(
      Response.json({ userId: "22222222-2222-4222-8222-222222222222" }),
    );
    expect(await prepareRoomEntrySession(GUEST, NOW)).toEqual({
      ok: false,
      reason: "identity_unavailable",
    });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it.each([
    ["別sub", { ...GUEST, sub: "22222222-2222-4222-8222-222222222222" }],
    ["同じsubのaccount", ACCOUNT],
    ["本人なし", null],
  ] as const)(
    "Worker応答待ちにCookieが%sへ変わったら上書きしない",
    async (_condition, user) => {
      mocks.api.mockImplementation(async () => {
        await currentCookie(user);
        return Response.json({ userId: GUEST.sub });
      });
      expect(await prepareRoomEntrySession(GUEST, NOW)).toEqual({
        ok: false,
        reason: "identity_unavailable",
      });
      expect(mocks.set).not.toHaveBeenCalled();
    },
  );

  it.each(["通信例外", "503", "不正JSON", "不正UUID", "余分なフィールド"])(
    "%sなら再試行を返しCookieを書かない",
    async (condition) => {
      if (condition === "通信例外")
        mocks.api.mockRejectedValue(new TypeError("offline"));
      else
        mocks.api.mockResolvedValue(
          condition === "503"
            ? new Response(null, { status: 503 })
            : condition === "不正JSON"
              ? new Response("<html>error</html>")
              : condition === "不正UUID"
                ? Response.json({ userId: "invalid" })
                : Response.json({
                    userId: GUEST.sub,
                    exp: NOW + SESSION_TTL_SECONDS,
                  }),
        );
      expect(await prepareRoomEntrySession(GUEST, NOW)).toEqual({
        ok: false,
        reason: "retry",
      });
      expect(mocks.set).not.toHaveBeenCalled();
    },
  );
});
