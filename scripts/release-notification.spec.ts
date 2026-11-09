// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { executeAutomation } from "./release-automation.mts";
import { recordActions, recordRelease } from "./release-history.mts";

vi.mock("./release-history.mts", async (original) => ({
  ...(await original<typeof import("./release-history.mts")>()),
  recordActions: vi.fn(),
  recordRelease: vi.fn(),
}));
const result = {
  tag: "prod-2026.11.08.1",
  body: "- **変更**：通知を追加",
  existing: false,
  url: "https://github.com/engineer-first/idea-boost/releases/tag/prod-2026.11.08.1",
};
const env = {
  DISCORD_WEBHOOK_URL_RELEASE: "https://discord.com/api/webhooks/test",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(recordActions).mockResolvedValue(result);
  vi.mocked(recordRelease).mockResolvedValue(result);
});
it.each([
  ["actions", "123", "1", "--publish"],
  ["retry", "--publish"],
])("%j の記録が完了してから通知する", async (...args) => {
  const send = vi.fn<typeof fetch>().mockImplementation(async () => {
    expect(recordActions).toHaveBeenCalled();
    return new Response(null, { status: 204 });
  });
  await executeAutomation(
    args,
    { ...env, RUN_ID: "123", RUN_ATTEMPT: "1" },
    vi.fn(),
    send,
  );
  expect(send).toHaveBeenCalledOnce();
});
it("手動receiptの履歴補完でも記録後に通知する", async () => {
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status: 204 }));
  await executeAutomation(
    ["retry", "--publish"],
    {
      ...env,
      RELEASE_NOTE_JSON: JSON.stringify({ deployment: { kind: "manual" } }),
    },
    vi.fn(),
    send,
  );
  expect(recordRelease).toHaveBeenCalled();
  expect(send).toHaveBeenCalledOnce();
});
it("記録が失敗したときとプレビューでは送らない", async () => {
  const send = vi.fn<typeof fetch>();
  vi.mocked(recordActions).mockRejectedValueOnce(new Error("記録失敗"));
  await expect(
    executeAutomation(["actions", "123", "1", "--publish"], env, vi.fn(), send),
  ).rejects.toThrow("記録失敗");
  await executeAutomation(["actions", "123", "1"], env, vi.fn(), send);
  expect(send).not.toHaveBeenCalled();
});
