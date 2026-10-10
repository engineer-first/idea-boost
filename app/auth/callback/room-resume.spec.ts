// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ROOM_ENTRY_AUDIENCE,
  ROOM_OAUTH_RESUME_COOKIE,
  ROOM_RESUME_COOKIE,
  RoomOAuthResumeSchema,
} from "@/contracts/room-entry";
import { OAUTH_STATE_COOKIE } from "@/lib/session/cookie";
import { signToken, verifyToken } from "@/lib/session/token";

const mocks = vi.hoisted(() => ({
  store: new Map<string, string>(),
  establish: vi.fn(),
  verifyGoogle: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => {
      const value = mocks.store.get(key);
      return value ? { value } : undefined;
    },
    set: (key: string, value: string) => mocks.store.set(key, value),
    delete: (key: string) => mocks.store.delete(key),
  }),
}));
vi.mock("@/lib/session/establish", () => ({
  establishSession: mocks.establish,
}));
vi.mock("jose", async (original) => {
  const actual = await original<typeof import("jose")>();
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(),
    jwtVerify: (token: string, ...args: unknown[]) =>
      token === "google-id-token"
        ? mocks.verifyGoogle()
        : Reflect.apply(actual.jwtVerify, undefined, [token, ...args]),
  };
});

import { GET } from "./route";

const principal = "11111111-1111-4111-8111-111111111111";
const secret = "test-only-secret-32-characters-very-long";
const state = "11111111-1111-4111-8111-111111111112";
const nonce = "11111111-1111-4111-8111-111111111113";
const tabId = "11111111-1111-4111-8111-111111111114";
async function prepare(expires = 600, contextState = state) {
  mocks.store.set(
    OAUTH_STATE_COOKIE,
    JSON.stringify({ state, nonce, next: "/auth/resume" }),
  );
  mocks.store.set(
    ROOM_OAUTH_RESUME_COOKIE,
    await signToken(
      {
        ticketId: crypto.randomUUID(),
        principal,
        tabId,
        state: contextState,
        nonce,
        operation: { kind: "return", roomId: crypto.randomUUID() },
      },
      {
        secret,
        audience: ROOM_ENTRY_AUDIENCE.oauth,
        expiresInSeconds: expires,
      },
    ),
  );
}
function request(code = "code", queryState = state) {
  return new NextRequest(
    `http://localhost:3000/auth/callback?code=${code}&state=${queryState}`,
  );
}
beforeEach(() => {
  mocks.store.clear();
  vi.clearAllMocks();
  vi.stubEnv("SESSION_SECRET", secret);
  vi.stubEnv("GOOGLE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  mocks.establish.mockResolvedValue({
    ok: true,
    user: { sub: principal, email: "owner@example.test" },
  });
  mocks.verifyGoogle.mockResolvedValue({
    payload: {
      sub: "google-id",
      email: "owner@example.test",
      email_verified: true,
      nonce,
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ id_token: "google-id-token" })),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Google成功と安全な元操作の対応", () => {
  it("同じ本人だけ元操作を保持しstateを消費する", async () => {
    await prepare();
    const response = await GET(request());
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/auth/resume",
    );
    const token = mocks.store.get(ROOM_RESUME_COOKIE);
    expect(token).toBeTruthy();
    const grant = await verifyToken(token ?? "", RoomOAuthResumeSchema, {
      secret,
      audience: ROOM_ENTRY_AUDIENCE.resume,
    });
    expect(grant).toMatchObject({
      principal,
      tabId,
      state,
      nonce,
      operation: { kind: "return" },
    });
    const second = await GET(request());
    expect(new URL(second.headers.get("location") ?? "").pathname).toBe(
      "/login",
    );
    expect(mocks.establish).toHaveBeenCalledOnce();
  });
  it("別アカウント成功では元操作を発行しない", async () => {
    await prepare();
    mocks.establish.mockResolvedValue({
      ok: true,
      user: { sub: "22222222-2222-4222-8222-222222222222" },
    });
    const response = await GET(request());
    expect(response.headers.get("location")).toContain("error=account_changed");
    expect(mocks.store.has(ROOM_RESUME_COOKIE)).toBe(false);
  });
  it.each([
    "expired",
    "state",
    "other_tab",
    "cancel",
  ])("%s は自動再開を拒否", async (kind) => {
    await prepare(
      kind === "expired" ? -1 : 600,
      kind === "state" ? crypto.randomUUID() : state,
    );
    const response = await GET(
      request(
        kind === "cancel" ? "" : "code",
        kind === "other_tab" ? crypto.randomUUID() : state,
      ),
    );
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
      "/login",
    );
    expect(mocks.establish).not.toHaveBeenCalled();
    expect(mocks.store.has(ROOM_RESUME_COOKIE)).toBe(false);
  });
});
