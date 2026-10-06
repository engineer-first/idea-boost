// @vitest-environment node
// apiFetch の境界契約: セッション Cookie の転送と、外部呼び出しの打ち切り
// （タイムアウト signal）が配線されていることを検証する。
// タイムアウトが無いと api-worker の無応答が Server Action の無期限ブロックになる。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCookieMock } = vi.hoisted(() => ({
  getCookieMock: vi.fn<() => { value: string } | undefined>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: getCookieMock }),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  // Cloudflare コンテキスト外（通常の next dev / テスト）を再現する。
  getCloudflareContext: () => {
    throw new Error("not in cloudflare context");
  },
}));

import { apiFetch, lookupRoomByInviteCode } from "@/lib/api-client";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("API_WORKER_URL", "http://localhost:8787");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response("{}"));
  getCookieMock.mockReturnValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("apiFetch", () => {
  it("セッション Cookie があれば転送する", async () => {
    getCookieMock.mockReturnValue({ value: "token-value" });

    await apiFetch("/api/rooms");

    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Cookie")).toContain("token-value");
  });

  it("外部呼び出しにタイムアウト用の AbortSignal を設定する", async () => {
    await apiFetch("/api/rooms");

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    "caller",
    "timeout",
  ] as const)("signal指定時も%sによってWorker呼び出しを中止する", async (source) => {
    const controller = new AbortController();
    const timeout = new AbortController();
    const timeoutMock = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeout.signal);

    await apiFetch("/api/rooms", { signal: controller.signal });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal?.aborted).toBe(false);
    const reason = new Error(source);
    (source === "caller" ? controller : timeout).abort(reason);
    expect(init?.signal?.aborted).toBe(true);
    expect(init?.signal?.reason).toBe(reason);
    expect(timeoutMock).toHaveBeenCalledWith(10_000);
  });
});

describe("lookupRoomByInviteCode", () => {
  const room = {
    roomId: "123e4567-e89b-42d3-a456-426614174000",
    inviteCode: "ABC234",
    hostName: "田中太郎",
  };

  it("成功時は found を返す", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(room));
    await expect(lookupRoomByInviteCode("ABC234")).resolves.toEqual({
      kind: "found",
      room,
    });
  });

  it("404 は not_found（不存在と誤案内しないために 5xx と分ける）", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    await expect(lookupRoomByInviteCode("ABC234")).resolves.toEqual({
      kind: "not_found",
    });
  });

  it("400 は not_found", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 400 }));
    await expect(lookupRoomByInviteCode("bad")).resolves.toEqual({
      kind: "not_found",
    });
  });

  it("5xx は unavailable（ルームが見つからないとは言わない）", async () => {
    fetchMock.mockResolvedValueOnce(new Response("error", { status: 503 }));
    await expect(lookupRoomByInviteCode("ABC234")).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("ネットワーク例外は unavailable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(lookupRoomByInviteCode("ABC234")).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("2xx でも不正ボディは unavailable", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ roomId: "x" }));
    await expect(lookupRoomByInviteCode("ABC234")).resolves.toEqual({
      kind: "unavailable",
    });
  });
});
