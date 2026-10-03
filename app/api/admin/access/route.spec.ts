// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const { apiFetch, getCurrentUser } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiFetch }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser }));

import { DELETE, GET, POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  getCurrentUser.mockResolvedValue({ sub: "manager" });
  apiFetch.mockResolvedValue(Response.json({ users: [] }));
});
it.each([GET, POST, DELETE])(
  "未認証はWorkerへ送らず拒否する",
  async (handler) => {
    getCurrentUser.mockResolvedValue(null);
    const response = await handler(
      new Request(
        "https://app.test/api/admin/access?permission=feedback%3Aread",
      ),
    );
    expect(response.status).toBe(401);
    expect(apiFetch).not.toHaveBeenCalled();
  },
);
it.each([
  ["GET", GET],
  ["POST", POST],
  ["DELETE", DELETE],
] as const)(
  "%sで意見の権限指定と本文をWorkerへ転送する",
  async (method, handler) => {
    const response = await handler(
      new Request(
        "https://app.test/api/admin/access?permission=feedback%3Aread",
        {
          method,
          body:
            method === "GET"
              ? undefined
              : JSON.stringify({ email: "reader@test.invalid" }),
        },
      ),
    );
    expect(response.status).toBe(200);
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/admin/access?permission=feedback%3Aread",
      expect.objectContaining({ method, cache: "no-store" }),
    );
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  },
);
