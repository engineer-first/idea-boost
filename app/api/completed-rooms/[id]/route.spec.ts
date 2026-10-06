import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), api: vi.fn() }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/api-client", () => ({ apiFetch: mocks.api }));

import { GET } from "./route";

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
