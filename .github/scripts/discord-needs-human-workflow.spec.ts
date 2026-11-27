// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { buildDiscordNeedsHumanPayload } from "./discord-needs-human-notify.js";

const workflow = parse(
  readFileSync(
    new URL("../workflows/discord-needs-human-notify.yml", import.meta.url),
    "utf8",
  ),
);
const script = workflow.jobs.notify.steps.find(
  (step: { name?: string }) => step.name === "Notify Discord",
).with.script;

async function run(
  payload: Record<string, unknown>,
  webhook = "https://example.com/webhook",
  ownerId = "123456789012345678",
) {
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  const core = { info: vi.fn(), warning: vi.fn(), setFailed: vi.fn() };
  await runInNewContext(`(async () => { ${script} })()`, {
    require: () => ({ buildDiscordNeedsHumanPayload }),
    process: {
      env: {
        DISCORD_WEBHOOK_URL: webhook,
        OWNER_DISCORD_ID: ownerId,
      },
    },
    context: { payload },
    fetch,
    core,
  });
  return { fetch, core };
}

const issue = {
  number: 1232,
  title: "Search Console",
  html_url: "https://github.com/engineer-first/idea-boost/issues/1232",
  state: "open",
};

describe("needs-human の通知", () => {
  it("Issue と PR の labeled で起きる", () => {
    expect(workflow.on.issues.types).toEqual(["labeled"]);
    expect(workflow.on.pull_request.types).toEqual(["labeled"]);
  });

  it.each([
    { label: "needs-human", state: "open", expected: 1 },
    { label: "loop:ready", state: "open", expected: 0 },
    { label: "needs-human", state: "closed", expected: 0 },
  ])(
    "$state の Issue に $label が付いたら $expected 回送る",
    async ({ label, state, expected }) => {
      const { fetch } = await run({
        issue: { ...issue, state },
        label: { name: label },
      });
      expect(fetch).toHaveBeenCalledTimes(expected);
    },
  );

  it("PR に付いたときは PR として送る", async () => {
    const { fetch } = await run({
      pull_request: { ...issue, number: 1407 },
      label: { name: "needs-human" },
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.embeds[0].title).toBe("#1407 Search Console");
    expect(body.embeds[0].description).toContain("PR に needs-human");
  });

  it("webhook が無いときは送らずに警告する", async () => {
    const { fetch, core } = await run(
      { issue, label: { name: "needs-human" } },
      "",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalled();
  });

  it("オーナーの Discord ID が無いときは、メンション無しで送り、警告する", async () => {
    const { fetch, core } = await run(
      { issue, label: { name: "needs-human" } },
      "https://example.com/webhook",
      "",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("OWNER_DISCORD_ID"),
    );
  });
});
