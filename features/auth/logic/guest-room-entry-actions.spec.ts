// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshGuestRoomEntry } from "@/features/auth";

const mocks = vi.hoisted(() => ({ user: vi.fn(), prepare: vi.fn() }));
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
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue(user);
});
describe("入室前ゲスト更新Action", () => {
  it("本人なしなら本人確認不可を返して更新しない", async () => {
    mocks.user.mockResolvedValue(null);
    expect(await refreshGuestRoomEntry()).toEqual({
      ok: false,
      reason: "identity_unavailable",
    });
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("更新成功ではuserをクライアントへ返さない", async () => {
    mocks.prepare.mockResolvedValue({
      ok: true,
      user: { ...user, exp: 1800604800 },
    });
    expect(await refreshGuestRoomEntry()).toEqual({ ok: true });
    expect(mocks.prepare).toHaveBeenCalledWith(user);
  });
  it.each(["identity_unavailable", "retry", "reauth_required"] as const)(
    "%sをそのまま返しuserを含めない",
    async (reason) => {
      mocks.prepare.mockResolvedValue({ ok: false, reason });
      expect(await refreshGuestRoomEntry()).toEqual({ ok: false, reason });
      expect(mocks.prepare).toHaveBeenCalledWith(user);
    },
  );
});
