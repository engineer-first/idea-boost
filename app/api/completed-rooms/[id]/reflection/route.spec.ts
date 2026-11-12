import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), api: vi.fn() }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ id: "room" }) };
function request(
  body: unknown = { action: "research", revision: 0 },
  origin = "https://app.test",
) {
  return new Request("https://app.test/api/completed-rooms/room/reflection", {
    method: "POST",
    headers: { Origin: origin },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.api.mockResolvedValue(Response.json({ analysis: null, prompt: null }));
});
it("未認証は生成も再表示も拒否する", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await POST(request(), context)).status).toBe(401);
  expect(
    (
      await GET(
        new Request("https://app.test/api/completed-rooms/room/reflection"),
        context,
      )
    ).status,
  ).toBe(401);
  expect(mocks.api).not.toHaveBeenCalled();
});
it("異なるoriginやuserIdの混入をWorkerへ渡さない", async () => {
  mocks.user.mockResolvedValue({ sub: "user" });
  expect((await POST(request({}, "https://other.test"), context)).status).toBe(
    403,
  );
  expect((await POST(request({ userId: "other" }), context)).status).toBe(400);
  expect(mocks.api).not.toHaveBeenCalled();
});
it("本人の生成要求だけを長めの待機時間でWorkerへ転送する", async () => {
  mocks.user.mockResolvedValue({ sub: "user" });
  const response = await POST(
    request({ action: "artifact", revision: 1, artifact: "教材" }),
    context,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.api).toHaveBeenCalledWith(
    "/api/completed-rooms/room/reflection",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        action: "artifact",
        revision: 1,
        artifact: "教材",
      }),
    }),
    90000,
  );
});
