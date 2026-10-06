import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), api: vi.fn() }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));

import { GET } from "./route";

const request = new Request("https://app.test/api/rooms/room");
const context = { params: Promise.resolve({ id: "room" }) };
beforeEach(() => vi.resetAllMocks());
it("未認証はWorkerへ問い合わせず401", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await GET(request, context)).status).toBe(401);
  expect(mocks.api).not.toHaveBeenCalled();
});
it.each([
  200, 401, 404, 503,
])("Workerの%sを保持し本文を公開せずsignalを伝える", async (status) => {
  mocks.user.mockResolvedValue({ sub: "user" });
  mocks.api.mockResolvedValue(
    Response.json({ secret: "private", error: "internal" }, { status }),
  );
  const response = await GET(request, context);
  expect(response.status).toBe(status);
  expect(await response.text()).toBe("");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.api).toHaveBeenCalledWith("/api/rooms/room", {
    cache: "no-store",
    signal: request.signal,
  });
});
it("一時通信障害は404でなく503", async () => {
  mocks.user.mockResolvedValue({ sub: "user" });
  mocks.api.mockRejectedValue(new Error());
  expect((await GET(request, context)).status).toBe(503);
});
