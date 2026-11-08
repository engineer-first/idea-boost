// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { buildDiscordAssignPayload } from "./discord-issue-assign-notify.js";

const workflow = parse(
  readFileSync(
    new URL("../workflows/discord-issue-assign-notify.yml", import.meta.url),
    "utf8",
  ),
);
const script = workflow.jobs.notify.steps.find(
  (step: { name?: string }) => step.name === "Notify Discord",
).with.script;

describe("Issueのアサイン通知", () => {
  it.each([
    { state: "closed", expectedRequests: 0 },
    { state: "open", expectedRequests: 1 },
  ])(
    "$state のIssueにアサインされたら通知を $expectedRequests 回送信する",
    async ({ state, expectedRequests }) => {
      const fetch = vi.fn().mockResolvedValue({ ok: true });
      await runInNewContext(`(async () => { ${script} })()`, {
        require: () => ({ buildDiscordAssignPayload }),
        process: {
          env: { DISCORD_WEBHOOK_URL: "https://example.com/webhook" },
        },
        context: {
          payload: {
            issue: {
              number: 219,
              title: "アサイン通知",
              html_url:
                "https://github.com/engineer-first/idea-boost/issues/219",
              state,
            },
            assignee: { login: "junhat6" },
          },
        },
        fetch,
        core: { info: vi.fn(), warning: vi.fn(), setFailed: vi.fn() },
      });
      expect(fetch).toHaveBeenCalledTimes(expectedRequests);
    },
  );
});
