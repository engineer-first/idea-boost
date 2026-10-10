// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ROOM_ENTRY_AUDIENCE,
  ROOM_RESUME_COOKIE,
} from "@/contracts/room-entry";
import { signToken } from "@/lib/session/token";

const mocks = vi.hoisted(() => ({
  store: new Map<string, string>(),
  user: vi.fn(),
  api: vi.fn(),
  google: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => {
      const value = mocks.store.get(key);
      return value ? { value } : undefined;
    },
    delete: (key: string) => mocks.store.delete(key),
    set: (key: string, value: string) => mocks.store.set(key, value),
  }),
}));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));
vi.mock("./google-authorization", () => ({
  startGoogleAuthorization: mocks.google,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import {
  consumeRoomResume,
  startRoomReauthentication,
} from "./room-reauthentication";

const principal = "11111111-1111-4111-8111-111111111111";
const tabId = "11111111-1111-4111-8111-111111111112";
const secret = "test-secret-at-least-thirty-two-characters";
const operation = {
  kind: "return" as const,
  roomId: "11111111-1111-4111-8111-111111111113",
};
async function grant(expires = 600) {
  mocks.store.set(
    ROOM_RESUME_COOKIE,
    await signToken(
      {
        principal,
        tabId,
        operation,
        ticketId: crypto.randomUUID(),
        state: crypto.randomUUID(),
        nonce: crypto.randomUUID(),
      },
      {
        secret,
        audience: ROOM_ENTRY_AUDIENCE.resume,
        expiresInSeconds: expires,
      },
    ),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.clear();
  vi.stubEnv("SESSION_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  mocks.user.mockResolvedValue({
    sub: principal,
    email: "owner@example.test",
    exp: Math.floor(Date.now() / 1000) + 604800,
  });
  mocks.api.mockResolvedValue(Response.json({ ok: true }));
});
afterEach(() => vi.unstubAllEnvs());
describe("同じタブの再ログイン", () => {
  it("有効な認証でも明示操作でGoogleを開始する", async () => {
    await startRoomReauthentication(operation, tabId);
    expect(mocks.google).toHaveBeenCalledOnce();
  });
  it("署名情報と同じタブだけ元操作を一度受け取る", async () => {
    await grant();
    expect(await consumeRoomResume(tabId)).toEqual({
      ok: true,
      principal,
      operation,
    });
    expect(await consumeRoomResume(tabId)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(mocks.api).toHaveBeenCalledOnce();
  });
  it("別タブは消費しない", async () => {
    await grant();
    expect(await consumeRoomResume(crypto.randomUUID())).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(mocks.api).not.toHaveBeenCalled();
    expect((await consumeRoomResume(tabId)).ok).toBe(true);
  });
  it("別本人へ操作を渡さない", async () => {
    await grant();
    mocks.user.mockResolvedValue({ sub: crypto.randomUUID() });
    expect(await consumeRoomResume(tabId)).toEqual({
      ok: false,
      reason: "account_changed",
    });
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("署名が有効でも既に消費済みなら拒否する", async () => {
    await grant();
    mocks.api.mockResolvedValue(new Response(null, { status: 409 }));
    expect(await consumeRoomResume(tabId)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
  it("期限切れ・改ざんは操作を渡さない", async () => {
    await grant(-1);
    expect((await consumeRoomResume(tabId)).ok).toBe(false);
    await grant();
    mocks.store.set(
      ROOM_RESUME_COOKIE,
      `${mocks.store.get(ROOM_RESUME_COOKIE)}x`,
    );
    expect((await consumeRoomResume(tabId)).ok).toBe(false);
    expect(mocks.api).not.toHaveBeenCalled();
  });
});
