import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch }));

import { GET } from "./route";

describe("成果閲覧プロキシ", () => {
  beforeEach(() => apiFetch.mockReset());
  it("閲覧権限なしではAPIへ転送しない", async () => {
    const response = await GET(
      new Request("https://app.test/api/shared-outcomes"),
    );
    expect(response.status).toBe(401);
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it("トークンをURLに入れず転送し共有キャッシュを禁止する", async () => {
    apiFetch.mockResolvedValue(
      Response.json({ outcomes: [], nextCursor: null }),
    );
    const response = await GET(
      new Request("https://app.test/api/shared-outcomes?cursor=abc", {
        headers: { Authorization: "Bearer secret" },
      }),
    );
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/shared-outcomes?cursor=abc",
      expect.objectContaining({
        headers: { Authorization: "Bearer secret" },
        cache: "no-store",
      }),
    );
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
  it("無効化の拒否をそのまま返す", async () => {
    apiFetch.mockResolvedValue(
      Response.json({ error: "unauthorized" }, { status: 401 }),
    );
    const response = await GET(
      new Request("https://app.test/api/shared-outcomes", {
        headers: { Authorization: "Bearer old" },
      }),
    );
    expect(response.status).toBe(401);
  });
});
