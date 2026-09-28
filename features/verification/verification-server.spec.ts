import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_USERS } from "@/lib/session/dev-users";

const mocks = vi.hoisted(() => ({ user: vi.fn(), api: vi.fn() }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));

import {
  createVerification,
  getVerificationActive,
  isVerificationEnabled,
} from "./verification-server";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("IDEA_BOOST_VERIFY", "true");
  vi.stubEnv(
    "VERIFICATION_CONTROL_TOKEN",
    "verification-secret-longer-than-32-characters",
  );
  mocks.user.mockResolvedValue({ sub: DEV_USERS[0].id });
  mocks.api.mockReset();
});
describe("検証APIのNext境界", () => {
  const request = (origin = "http://localhost:3000") =>
    new Request("http://localhost:3000/api/verification/rooms", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({ checkpoint: "3-1" }),
    });
  it("本番・無効時は入口を閉じる", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isVerificationEnabled()).toBe(false);
    expect((await createVerification(request())).status).toBe(404);
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("未認証・member・異なるoriginから作成できない", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await createVerification(request())).status).toBe(401);
    mocks.user.mockResolvedValue({ sub: DEV_USERS[1].id });
    expect((await createVerification(request())).status).toBe(403);
    mocks.user.mockResolvedValue({ sub: DEV_USERS[0].id });
    expect(
      (await createVerification(request("https://example.com"))).status,
    ).toBe(403);
    expect(mocks.api).not.toHaveBeenCalled();
  });
  it("memberも現在のルームを参照でき、通信異常を成功にしない", async () => {
    mocks.user.mockResolvedValue({ sub: DEV_USERS[1].id });
    mocks.api.mockResolvedValue(Response.json({ active: null }));
    expect(await (await getVerificationActive()).json()).toEqual({
      active: null,
    });
    mocks.api.mockRejectedValue(new Error("offline"));
    expect((await getVerificationActive()).status).toBe(503);
  });
});
