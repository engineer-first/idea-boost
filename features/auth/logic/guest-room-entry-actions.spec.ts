// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshGuestRoomEntry } from "./guest-room-entry-actions";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  prepare: vi.fn(),
  api: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/session/room-entry-session", () => ({
  prepareRoomEntrySession: mocks.prepare,
}));
const user = {
  kind: "guest",
  sub: "11111111-1111-4111-8111-111111111111",
  email: null,
  exp: 1800000000,
};
const roomId = "22222222-2222-4222-8222-222222222222";
const room = {
  roomId,
  inviteCode: "ABCDEF",
  isHost: false,
  hostUserId: user.sub,
  phase: { kind: "lobby" },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue(user);
  mocks.api.mockResolvedValue(Response.json(room));
  mocks.prepare.mockResolvedValue({ ok: true, user });
});
describe("入室前ゲスト更新Action", () => {
  it("本人なしなら本人確認不可を返して更新しない", async () => {
    mocks.user.mockResolvedValue(null);
    expect(await refreshGuestRoomEntry(roomId)).toEqual({
      ok: false,
      reason: "identity_unavailable",
    });
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("不正roomIdでは在籍確認も更新もしない", async () => {
    expect(await refreshGuestRoomEntry("invalid/room")).toEqual({
      ok: false,
      reason: "identity_unavailable",
    });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404])(
    "在籍確認が%sなら本人確認不可を返し更新しない",
    async (status) => {
      mocks.api.mockResolvedValue(new Response(null, { status }));
      expect(await refreshGuestRoomEntry(roomId)).toEqual({
        ok: false,
        reason: "identity_unavailable",
      });
      expect(mocks.prepare).not.toHaveBeenCalled();
    },
  );
  it.each(["通信例外", "503", "201", "不正JSON", "不正スキーマ", "別roomId"])(
    "在籍確認が%sなら再試行を返し更新しない",
    async (condition) => {
      if (condition === "通信例外")
        mocks.api.mockRejectedValue(new TypeError("offline"));
      else
        mocks.api.mockResolvedValue(
          condition === "503"
            ? new Response(null, { status: 503 })
            : condition === "201"
              ? Response.json(room, { status: 201 })
              : condition === "不正JSON"
                ? new Response("invalid")
                : condition === "不正スキーマ"
                  ? Response.json({ roomId })
                  : Response.json({ ...room, roomId: user.sub }),
        );
      expect(await refreshGuestRoomEntry(roomId)).toEqual({
        ok: false,
        reason: "retry",
      });
      expect(mocks.prepare).not.toHaveBeenCalled();
    },
  );
  it("更新成功ではuserをクライアントへ返さない", async () => {
    mocks.prepare.mockResolvedValue({
      ok: true,
      user: { ...user, exp: 1800604800 },
    });
    expect(await refreshGuestRoomEntry(roomId)).toEqual({ ok: true });
    expect(mocks.api).toHaveBeenCalledWith(`/api/rooms/${roomId}`, {
      cache: "no-store",
    });
    expect(mocks.prepare).toHaveBeenCalledWith(user);
  });
  it.each(["identity_unavailable", "retry", "reauth_required"] as const)(
    "%sをそのまま返しuserを含めない",
    async (reason) => {
      mocks.prepare.mockResolvedValue({ ok: false, reason });
      expect(await refreshGuestRoomEntry(roomId)).toEqual({
        ok: false,
        reason,
      });
      expect(mocks.prepare).toHaveBeenCalledWith(user);
    },
  );
});
