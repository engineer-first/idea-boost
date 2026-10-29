import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("秒のずれがある連続する5分枠のCron成功を検証完了にする", () => {
  const directory = mkdtempSync(join(tmpdir(), "pbi-cron-check-"));
  try {
    const cli = join(directory, "node_modules/wrangler/bin");
    mkdirSync(cli, { recursive: true });
    const start = Math.floor(Date.now() / 300_000) * 300_000;
    const events = [start + 34_000, start + 300_000 + 57_000].map(
      (scheduledTime) => ({
        outcome: "ok",
        logs: [{ message: [{ event: "pbi_priority_synced", scheduledTime }] }],
      }),
    );
    writeFileSync(
      join(cli, "wrangler.js"),
      `for (const event of ${JSON.stringify(events)}) console.log(JSON.stringify(event, null, 4));`,
    );
    const result = spawnSync(
      process.execPath,
      [resolve("scripts/check-pbi-priority-cron.mjs")],
      {
        cwd: directory,
        encoding: "utf8",
        timeout: 5000,
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Verified:");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
