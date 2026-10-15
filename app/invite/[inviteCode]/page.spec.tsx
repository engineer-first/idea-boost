// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ lookupRoomByInviteCode: mocks.lookup }));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: async () => ({ sub: "user" }),
}));
vi.mock("@/features/auth", () => ({
  getLoginPath: vi.fn(),
  sanitizeNextPath: vi.fn(),
}));
vi.mock("@/features/room-lifecycle", () => ({ InviteCodeDialog: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(decodeURIComponent(url));
  },
}));

import InvitePage from "./page";

beforeEach(() => vi.clearAllMocks());
it("終了済みを含む404では終了の可能性と招待元への確認を案内する", async () => {
  mocks.lookup.mockResolvedValue({ kind: "not_found" });
  await expect(
    InvitePage({ params: Promise.resolve({ inviteCode: "ABC123" }) }),
  ).rejects.toThrow(
    "ルームが終了したか、招待コードが無効な可能性があります。招待元に確認してください。",
  );
});
it("通信障害では終了・無効と案内せず再試行を促す", async () => {
  mocks.lookup.mockResolvedValue({ kind: "unavailable" });
  await expect(
    InvitePage({ params: Promise.resolve({ inviteCode: "ABC123" }) }),
  ).rejects.toThrow(
    "ルーム情報を取得できませんでした。しばらくしてから再度お試しください。",
  );
});
it("形式不正の招待リンクは照会せず入力形式を案内する", async () => {
  await expect(
    InvitePage({ params: Promise.resolve({ inviteCode: "invalid" }) }),
  ).rejects.toThrow("招待コードは英数字6桁で入力してください。");
  expect(mocks.lookup).not.toHaveBeenCalled();
});
