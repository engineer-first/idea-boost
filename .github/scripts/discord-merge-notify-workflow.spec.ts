// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const workflow = parse(
  readFileSync(
    new URL("../workflows/discord-merge-notify.yml", import.meta.url),
    "utf8",
  ),
);
const condition: string = workflow.jobs.notify.if;

describe("developへのマージ通知", () => {
  it("マージされたPRだけを通知する", () => {
    expect(condition).toContain("github.event.pull_request.merged == true");
  });

  it("Renovateの依存更新PRは通知しない", () => {
    expect(condition).toContain(
      "github.event.pull_request.user.login != 'renovate[bot]'",
    );
  });
});
