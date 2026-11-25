import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));

import { GET } from "./route";

beforeEach(() => {
  mocks.api.mockReset();
  mocks.user.mockReset();
});
it("未認証には本文を返さず401、Workerを呼ばない", async () => {
  mocks.user.mockResolvedValue(null);
  const res = await GET();
  expect(res.status).toBe(401);
  expect(mocks.api).not.toHaveBeenCalled();
  expect(res.headers.get("Cache-Control")).toBe("private, no-store");
});
it("本人の要求だけをWorkerへ転送し、上流の失敗を保持する", async () => {
  mocks.user.mockResolvedValue({ sub: "user" });
  mocks.api.mockResolvedValue(Response.json({ rooms: [] }));
  const ok = await GET();
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ rooms: [] });
  expect(mocks.api).toHaveBeenCalledWith("/api/recent-rooms", {
    cache: "no-store",
  });
  mocks.api.mockRejectedValue(new Error());
  expect((await GET()).status).toBe(503);
});
