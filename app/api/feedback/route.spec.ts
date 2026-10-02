// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const { apiFetch, getCurrentUser } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiFetch }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser }));

import { GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  getCurrentUser.mockResolvedValue({ sub: "reader" });
});
it("未認証はWorkerへ進まずno-storeで拒否する", async () => {
  getCurrentUser.mockResolvedValue(null);
  const response = await GET(new Request("https://app.test/api/feedback"));
  expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(apiFetch).not.toHaveBeenCalled();
});
it.each([401, 403, 400])(
  "現在の権限・入力をWorkerで検査した%sを保持する",
  async (status) => {
    apiFetch.mockResolvedValue(
      Response.json({ error: "rejected" }, { status }),
    );
    const response = await GET(
      new Request("https://app.test/api/feedback?kind=good", {
        headers: { Authorization: "Bearer forged" },
      }),
    );
    expect(response.status).toBe(status);
    expect(apiFetch).toHaveBeenCalledWith("/api/feedback?kind=good", {
      cache: "no-store",
    });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  },
);
it("通信例外を本文や内部情報を含まない503にする", async () => {
  apiFetch.mockRejectedValue(new Error("secret internal text"));
  const response = await GET(new Request("https://app.test/api/feedback"));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("secret");
});
