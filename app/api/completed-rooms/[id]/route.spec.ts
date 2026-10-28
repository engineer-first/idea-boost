import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), api: vi.fn() }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));

import { GET } from "./route";

beforeEach(() => {
  mocks.user.mockReset();
  mocks.api.mockReset();
});

it("完了照会の中止signalをWorkerにも伝える", async () => {
  mocks.user.mockResolvedValue({ sub: "user" });
  mocks.api.mockResolvedValue(
    Response.json({ error: "not found" }, { status: 404 }),
  );
  const request = new Request("https://app.test/api/completed-rooms/room");
  expect(
    (await GET(request, { params: Promise.resolve({ id: "room" }) })).status,
  ).toBe(404);
  expect(mocks.api).toHaveBeenCalledWith("/api/completed-rooms/room", {
    cache: "no-store",
    signal: request.signal,
  });
});

it("ゲスト本人の詳細要求をWorkerへ転送しprivate, no-storeで返す", async () => {
  mocks.user.mockResolvedValue({ kind: "guest", sub: "guest", email: null });
  mocks.api.mockResolvedValue(Response.json({ roomId: "room" }));
  const request = new Request("https://app.test/api/completed-rooms/room");
  const response = await GET(request, {
    params: Promise.resolve({ id: "room" }),
  });
  expect(response.status).toBe(200);
  expect(mocks.api).toHaveBeenCalledWith("/api/completed-rooms/room", {
    cache: "no-store",
    signal: request.signal,
  });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("未認証の詳細要求は401でWorkerを呼ばない", async () => {
  mocks.user.mockResolvedValue(null);
  const response = await GET(
    new Request("https://app.test/api/completed-rooms/room"),
    { params: Promise.resolve({ id: "room" }) },
  );
  expect(response.status).toBe(401);
  expect(mocks.api).not.toHaveBeenCalled();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
