// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLobbyPhase } from "@/contracts/phase.fixture";
import { ROOM_ENTRY_AUDIENCE } from "@/contracts/room-entry";
import { signToken } from "./token";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));

import { bindRoomEntry, issueRoomEntry, verifyRoomEntry } from "./room-entry";

const roomId = "11111111-1111-4111-8111-111111111111";
const principal = "11111111-1111-4111-8111-111111111112";
const tabId = "11111111-1111-4111-8111-111111111113";
const user = {
  sub: principal,
  email: "owner@example.test",
  exp: Math.floor(Date.now() / 1000) + 604800,
};
const secret = "test-secret-at-least-thirty-two-characters";
async function entry(stage: "lobby" | "board") {
  return signToken(
    {
      ticketId: crypto.randomUUID(),
      principal,
      tabId,
      roomId,
      stage,
      sessionExp: user.exp,
    },
    { secret, audience: ROOM_ENTRY_AUDIENCE.entry, expiresInSeconds: 600 },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SESSION_SECRET", secret);
  mocks.api.mockImplementation(async (path: string) =>
    path === "/api/auth/consume-ticket"
      ? Response.json({ ok: true })
      : Response.json({
          roomId,
          inviteCode: "ABC234",
          isHost: true,
          hostUserId: principal,
          phase: buildLobbyPhase(),
        }),
  );
});
afterEach(() => vi.unstubAllEnvs());
describe("入室継続の用途・タブ・認証への限定", () => {
  it("盤面用のticketでロビーへ逆戻りして控えを増やさない", async () => {
    expect(
      await verifyRoomEntry(await entry("board"), roomId, user, tabId, "lobby"),
    ).toEqual({ ok: false });
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("他タブ・他対象・違う認証をWorker消費前に拒否する", async () => {
    const token = await entry("lobby");
    for (const args of [
      [roomId, user, crypto.randomUUID()],
      [crypto.randomUUID(), user, tabId],
      [roomId, { ...user, exp: user.exp + 1 }, tabId],
    ] as const)
      expect(
        await verifyRoomEntry(token, args[0], args[1], args[2], "lobby"),
      ).toEqual({
        ok: false,
      });
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("ロビーの続きだけ盤面用admissionを発行し盤面では終える", async () => {
    expect(
      await verifyRoomEntry(await entry("lobby"), roomId, user, tabId, "lobby"),
    ).toMatchObject({ ok: true, admission: expect.any(String) });
    expect(
      await verifyRoomEntry(await entry("board"), roomId, user, tabId, "board"),
    ).toEqual({ ok: true });
  });
  it("現在の在籍を失っていれば古い控えを束縛しない", async () => {
    mocks.api.mockResolvedValue(new Response(null, { status: 404 }));
    expect(
      await bindRoomEntry(
        await issueRoomEntry(roomId, user),
        roomId,
        user,
        tabId,
      ),
    ).toBeNull();
    expect(mocks.api).toHaveBeenCalledOnce();
  });
  it("admissionが使用済みなら次ticketを発行しない", async () => {
    mocks.api.mockImplementation(async (path: string) =>
      path === "/api/auth/consume-ticket"
        ? new Response(null, { status: 409 })
        : Response.json({
            roomId,
            inviteCode: "ABC234",
            isHost: true,
            hostUserId: principal,
            phase: buildLobbyPhase(),
          }),
    );
    expect(
      await bindRoomEntry(
        await issueRoomEntry(roomId, user),
        roomId,
        user,
        tabId,
      ),
    ).toBeNull();
  });
});
