// @vitest-environment node
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VerifiedSession } from "@/contracts/session";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  getLoginPath: vi.fn((next: string) => `login:${next}`),
  currentUser: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw new Error(`redirect: ${url}`);
  }),
  InviteCodeDialog: vi.fn(),
  InviteStatusView: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ lookupRoomByInviteCode: mocks.lookup }));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: mocks.currentUser,
}));
vi.mock("@/features/auth", () => ({
  getLoginPath: mocks.getLoginPath,
  sanitizeNextPath: (path: string) => path,
}));
vi.mock("@/features/room-lifecycle", () => ({
  InviteCodeDialog: mocks.InviteCodeDialog,
  InviteStatusView: mocks.InviteStatusView,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import InvitePage from "./page";

const account: VerifiedSession = {
  kind: "account",
  sub: "11111111-1111-4111-8111-111111111111",
  email: "account@example.test",
  name: "本人",
  exp: 2000000000,
};
const guest: VerifiedSession = { ...account, kind: "guest", email: null };
const room = {
  roomId: "123e4567-e89b-42d3-a456-426614174000",
  inviteCode: "ABC234",
  hostName: "ホスト",
};
function page(inviteCode = " abc234 ") {
  return InvitePage({ params: Promise.resolve({ inviteCode }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser.mockResolvedValue(account);
  mocks.lookup.mockResolvedValue({ kind: "found", room });
});

describe("招待ページ", () => {
  it("形式不正なら本人情報もルームも照会せず invalid を描画する", async () => {
    const element = await page("invalid");
    expect(element.type).toBe(mocks.InviteStatusView);
    expect(element.props).toMatchObject({ kind: "invalid" });
    expect(mocks.currentUser).not.toHaveBeenCalled();
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("本人なしなら照会せず正規化コードを戻り先にして選択画面へリダイレクトする", async () => {
    mocks.currentUser.mockResolvedValue(null);
    await expect(page()).rejects.toThrow("redirect: login:/invite/ABC234");
    expect(mocks.getLoginPath).toHaveBeenCalledExactlyOnceWith(
      "/invite/ABC234",
    );
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(
      "login:/invite/ABC234",
    );
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it.each(["not_found", "ended", "unavailable"] as const)(
    "照会結果 %s を同じ kind の状態画面として描画する",
    async (kind) => {
      mocks.lookup.mockResolvedValue({ kind });
      const element = await page();
      expect(element.type).toBe(mocks.InviteStatusView);
      expect(element.props).toMatchObject({ kind });
      expect(mocks.lookup).toHaveBeenCalledExactlyOnceWith("ABC234");
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it("通信障害の再試行先に正規化済みの招待コードを保持する", async () => {
    mocks.lookup.mockResolvedValue({ kind: "unavailable" });
    const element = await page();
    expect(element.type).toBe(mocks.InviteStatusView);
    expect(element.props).toMatchObject({
      kind: "unavailable",
      retryHref: "/invite/ABC234",
    });
  });

  it.each([account, guest])(
    "$kind 本人の照会が成功すれば本人ID・招待コード・ホスト名を確認画面へ渡す",
    async (user) => {
      mocks.currentUser.mockResolvedValue(user);
      const element = await page();
      expect(isValidElement(element)).toBe(true);
      expect(element.type).toBe(mocks.InviteCodeDialog);
      expect(element.props).toEqual({
        currentUserId: user.sub,
        inviteCode: "ABC234",
        hostName: "ホスト",
      });
      expect(mocks.lookup).toHaveBeenCalledExactlyOnceWith("ABC234");
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );
});
