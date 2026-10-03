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
  const res = await GET(new Request("https://app.test/api/completed-rooms"));
  expect(res.status).toBe(401);
  expect(mocks.api).not.toHaveBeenCalled();
  expect(res.headers.get("Cache-Control")).toBe("private, no-store");
});
it("現在のセッションでページ位置を渡し、Workerの拒否を保持する", async () => {
  mocks.user.mockResolvedValue({ sub: "user" });
  mocks.api.mockResolvedValue(
    Response.json({ error: "not found" }, { status: 404 }),
  );
  const res = await GET(
    new Request("https://app.test/api/completed-rooms?cursor=a%2Bb", {
      headers: { Authorization: "Bearer unwanted" },
    }),
  );
  expect(res.status).toBe(404);
  expect(mocks.api).toHaveBeenCalledWith("/api/completed-rooms?cursor=a%2Bb", {
    cache: "no-store",
  });
});
it("通信失敗を一覧0件に変換しない", async () => {
  mocks.user.mockResolvedValue({ sub: "user" });
  mocks.api.mockRejectedValue(new Error());
  expect(
    (await GET(new Request("https://app.test/api/completed-rooms"))).status,
  ).toBe(503);
});
it.each([404, 500, 502])(
  "JSONでない応答でも上流の%sを保持する",
  async (status) => {
    mocks.user.mockResolvedValue({ sub: "user" });
    mocks.api.mockResolvedValue(new Response("<html>error</html>", { status }));
    const res = await GET(new Request("https://app.test/api/completed-rooms"));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: "unavailable" });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  },
);
