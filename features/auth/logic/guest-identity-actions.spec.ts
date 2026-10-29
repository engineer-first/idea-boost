// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  establish: vi.fn(),
  apiFetch: vi.fn(),
  setCookie: vi.fn(),
}));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: mocks.currentUser,
}));
vi.mock("@/lib/session/establish", () => ({
  establishSession: mocks.establish,
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.apiFetch }));
vi.mock("@/lib/session/cookie", () => ({ setSessionCookie: mocks.setCookie }));

import { ROOM_DISPLAY_NAME_MAX_LENGTH } from "@/contracts/room-protocol";
import { prepareGuestIdentity } from "./guest-identity-actions";
import {
  guestIdentityFailure,
  guestIdentityUnavailable,
} from "./guest-identity-copy";

const sub = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SESSION_SECRET", "a-sufficiently-long-random-secret-value");
  mocks.currentUser.mockResolvedValue(null);
  mocks.establish.mockImplementation(async (assertion) => ({
    ok: true,
    user: { kind: "guest", sub: assertion.userId, email: null },
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ゲスト本人の準備", () => {
  it.each(["guest", "account"] as const)(
    "有効な%sセッションは名前検証より先に再利用し同期もCookie発行もしない",
    async (kind) => {
      mocks.currentUser.mockResolvedValue({
        kind,
        sub,
        email: kind === "guest" ? null : "hana@example.test",
        name: "変更前",
        exp: Math.floor(Date.now() / 1000) + 600,
      });
      expect(await prepareGuestIdentity({ name: "   " })).toEqual({
        ok: true,
        principal: { userId: sub, kind },
        reused: true,
      });
      expect(mocks.establish).not.toHaveBeenCalled();
      expect(mocks.apiFetch).not.toHaveBeenCalled();
      expect(mocks.setCookie).not.toHaveBeenCalled();
    },
  );
  it.each([
    { name: "   " },
    { name: "あ".repeat(ROOM_DISPLAY_NAME_MAX_LENGTH + 1) },
    { name: "はな", userId: sub },
  ])("セッションなしで入力 %j が不正なら同期しない", async (input) => {
    expect(await prepareGuestIdentity(input)).toMatchObject({
      ok: false,
      error: expect.any(String),
    });
    expect(mocks.establish).not.toHaveBeenCalled();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it("上限文字数の名前を受け取りサーバーで生成したUUIDでゲストを確立する", async () => {
    const result = await prepareGuestIdentity({
      name: "あ".repeat(ROOM_DISPLAY_NAME_MAX_LENGTH),
    });
    expect(mocks.establish).toHaveBeenCalledOnce();
    const assertion = mocks.establish.mock.calls[0]?.[0];
    expect(assertion).toEqual({
      kind: "guest",
      userId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      displayName: "あ".repeat(ROOM_DISPLAY_NAME_MAX_LENGTH),
    });
    expect(result).toEqual({
      ok: true,
      principal: { userId: assertion.userId, kind: "guest" },
      reused: false,
    });
  });
  it("同期に失敗したら内部文言を出さず固定エラーを返しCookieを発行しない", async () => {
    mocks.establish.mockResolvedValue({
      ok: false,
      error: "同期できませんでした。",
    });
    expect(await prepareGuestIdentity({ name: "はな" })).toEqual({
      ok: false,
      error: guestIdentityFailure,
    });
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it("セッションなしで同じ名前を2回準備しても別のuserIdになる", async () => {
    const first = await prepareGuestIdentity({ name: "はな" });
    const second = await prepareGuestIdentity({ name: "はな" });
    expect(first).toMatchObject({ ok: true, reused: false });
    expect(second).toMatchObject({ ok: true, reused: false });
    expect(mocks.establish).toHaveBeenCalledTimes(2);
    expect(mocks.establish.mock.calls[0]?.[0].userId).not.toBe(
      mocks.establish.mock.calls[1]?.[0].userId,
    );
  });
  it("認証設定がないときは再試行を案内して同期しない", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    expect(await prepareGuestIdentity({ name: "はな" })).toEqual({
      ok: false,
      error: guestIdentityUnavailable,
    });
    expect(mocks.establish).not.toHaveBeenCalled();
  });
});
