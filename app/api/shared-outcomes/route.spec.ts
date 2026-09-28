import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiFetch }));

import { GET } from "./route";

describe("成果閲覧プロキシ", () => {
  beforeEach(() => apiFetch.mockReset());
  it("CookieをWorkerへ渡す既存クライアントで取得し、Bearerを転送しない", async () => {
    apiFetch.mockResolvedValue(
      Response.json({ outcomes: [], nextCursor: null }),
    );
    const response = await GET(
      new Request("https://app.test/api/shared-outcomes?cursor=abc", {
        headers: { Authorization: "Bearer old-secret" },
      }),
    );
    expect(apiFetch).toHaveBeenCalledWith("/api/shared-outcomes?cursor=abc", {
      cache: "no-store",
    });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("Workerの401・403をそのまま返す", async () => {
    apiFetch.mockResolvedValue(
      Response.json({ error: "forbidden" }, { status: 403 }),
    );
    expect(
      (await GET(new Request("https://app.test/api/shared-outcomes"))).status,
    ).toBe(403);
  });
});
