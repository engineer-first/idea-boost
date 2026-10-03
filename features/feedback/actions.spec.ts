// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { createFeedbackId } from "@/contracts/feedback";

const { apiFetch, getCurrentUser } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiFetch }));
vi.mock("@/lib/session/current-user", () => ({ getCurrentUser }));

import { submitFeedback } from "./actions";

const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const input = () => ({
  id: createFeedbackId(),
  target: "app",
  kind: "good",
  body: "",
  rating: null,
});
beforeEach(() => {
  vi.resetAllMocks();
  getCurrentUser.mockResolvedValue({ sub: "member" });
});
it("未ログインと偽装した属性・不正ルームIDをWorkerへ送らない", async () => {
  getCurrentUser.mockResolvedValue(null);
  expect((await submitFeedback(roomId, input())).ok).toBe(false);
  getCurrentUser.mockResolvedValue({ sub: "member" });
  expect((await submitFeedback("../feedback", input())).ok).toBe(false);
  expect(
    (await submitFeedback(roomId, { ...input(), authorId: "forged" })).ok,
  ).toBe(false);
  expect(apiFetch).not.toHaveBeenCalled();
});
it.each([401, 404, 409, 503])(
  "Workerの%sを受付成功にしない",
  async (status) => {
    apiFetch.mockResolvedValue(
      Response.json({ error: "internal detail" }, { status }),
    );
    const result = await submitFeedback(roomId, input());
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("internal detail");
  },
);
it("保存失敗と応答喪失は再送可能な失敗として返し、同じIDを渡す", async () => {
  const value = input();
  apiFetch.mockRejectedValueOnce(new Error("lost response"));
  expect((await submitFeedback(roomId, value)).ok).toBe(false);
  apiFetch.mockResolvedValueOnce(Response.json({ ok: true, id: value.id }));
  expect(await submitFeedback(roomId, value)).toEqual({
    ok: true,
    id: value.id,
  });
  expect(
    apiFetch.mock.calls.map((call) => JSON.parse(call[1].body).id),
  ).toEqual([value.id, value.id]);
  expect(apiFetch.mock.calls[0][1].cache).toBe("no-store");
});

it("「わからない」を検証してWorkerへ送信する", async () => {
  const value = { ...input(), kind: "unclear", target: "1-3" };
  apiFetch.mockResolvedValue(Response.json({ ok: true, id: value.id }));
  expect(await submitFeedback(roomId, value)).toEqual({
    ok: true,
    id: value.id,
  });
  expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual(value);
});
