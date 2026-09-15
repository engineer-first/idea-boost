import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-client";
import { setSessionCookie } from "@/lib/session/cookie";
import { getCurrentUser } from "@/lib/session/current-user";
import {
  createDemoRoom,
  getDemoStatus,
  isDemoEnabled,
  runDemoAction,
} from "./demo-server";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/session/cookie", () => ({
  setSessionCookie: vi.fn(),
  SESSION_TTL_SECONDS: 3600,
}));
vi.mock("@/lib/session/env", () => ({ getSessionSecret: () => "secret" }));
vi.mock("@/lib/session/token", () => ({
  signToken: vi.fn().mockResolvedValue("signed-session"),
}));

const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function post(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/demo/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("IDEA_BOOST_DEMO", "true");
  vi.stubEnv("DEMO_CONTROL_TOKEN", "control-secret");
});
afterEach(() => vi.unstubAllEnvs());

describe("デモ API の Next 境界", () => {
  it.each([
    "production",
    "test",
  ])("%s では全操作を404にしてセッションも作らない", async (env) => {
    vi.stubEnv("NODE_ENV", env);
    expect(isDemoEnabled()).toBe(false);
    expect((await createDemoRoom(post({ checkpoint: "start" }))).status).toBe(
      404,
    );
    expect((await getDemoStatus(roomId)).status).toBe(404);
    expect(
      (
        await runDemoAction(
          post({ action: "share", phase: 1, step: 2 }),
          roomId,
        )
      ).status,
    ).toBe(404);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(setSessionCookie).not.toHaveBeenCalled();
  });
  it("通常開発と token 未設定では無効", () => {
    vi.stubEnv("IDEA_BOOST_DEMO", "false");
    expect(isDemoEnabled()).toBe(false);
    vi.stubEnv("IDEA_BOOST_DEMO", "true");
    vi.stubEnv("DEMO_CONTROL_TOKEN", "");
    expect(isDemoEnabled()).toBe(false);
  });
  it("他サイトからの作成要求を拒否する", async () => {
    expect(
      (
        await createDemoRoom(
          post({ checkpoint: "start" }, "https://other.test"),
        )
      ).status,
    ).toBe(403);
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it("見せ場が不正なら session を発行しない", async () => {
    expect((await createDemoRoom(post({ checkpoint: "unknown" }))).status).toBe(
      400,
    );
    expect(setSessionCookie).not.toHaveBeenCalled();
  });
  it("作成時に実セッションを発行し制御 token をサーバーから渡す", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      Response.json({ roomId, inviteCode: "ABC123" }),
    );
    const response = await createDemoRoom(post({ checkpoint: "vote" }));
    expect(response.status).toBe(200);
    expect(setSessionCookie).toHaveBeenCalledWith("signed-session");
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/demo/rooms",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ checkpoint: "vote" }),
        headers: expect.objectContaining({
          "X-Demo-Control-Token": "control-secret",
        }),
      }),
    );
    expect(JSON.stringify(await response.json())).not.toContain(
      "control-secret",
    );
  });
  it("未認証の状況取得と操作は拒否する", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await getDemoStatus(roomId)).status).toBe(401);
    expect(
      (
        await runDemoAction(
          post({ action: "share", phase: 1, step: 2 }),
          roomId,
        )
      ).status,
    ).toBe(401);
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it("通信失敗を再試行できるエラーとして返す", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("secret detail"));
    const response = await createDemoRoom(post({ checkpoint: "start" }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      "secret detail",
    );
  });
});
