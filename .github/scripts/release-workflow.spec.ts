// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

function workflow(name: string) {
  return parse(
    readFileSync(new URL(`../workflows/${name}.yml`, import.meta.url), "utf8"),
  );
}

describe("本番公開と履歴の接続", () => {
  it("PRマージ・直接push・Actions手動の入口を同じDeployへつなぐ", () => {
    const deploy = workflow("deploy");
    expect(deploy.on.push.branches).toEqual(["release"]);
    expect(deploy.on).toHaveProperty("workflow_dispatch");
    expect(deploy.on).not.toHaveProperty("release");
    expect(deploy.jobs.gate.if).toContain("refs/heads/release");
    const validation = deploy.jobs.gate.steps.find(
      (step: { name?: string }) =>
        step.name === "Validate release note before deployment",
    );
    expect(validation.run).toContain("release-automation.mts prepare");
    expect(deploy.jobs["deploy-api"].needs).toBe("gate");
  });
  it("health成功後だけ書込権限のある記録ジョブを実行する", () => {
    const deploy = workflow("deploy");
    const record = deploy.jobs["record-release"];
    expect(record.needs).toBe("health-check");
    expect(record.permissions).toEqual({ contents: "write", actions: "read" });
    expect(
      record.steps.some((step: { run?: string }) =>
        step.run?.includes("release-automation.mts actions"),
      ),
    ).toBe(true);
    expect(deploy.permissions.contents).toBe("read");
  });
  it("記録だけの再試行・外部手動記録を同じキューで直列化し、デプロイしない", () => {
    const retry = workflow("release-history");
    expect(retry.on).toHaveProperty("workflow_dispatch");
    expect(retry.concurrency).toEqual(workflow("deploy").concurrency);
    expect(retry.concurrency.queue).toBe("max");
    expect(retry.jobs.record.if).toContain("default_branch");
    const commands = retry.jobs.record.steps
      .map((step: { run?: string }) => step.run ?? "")
      .join("\n");
    expect(commands).toContain("release-automation.mts retry");
    expect(commands).not.toMatch(/npm run deploy|wrangler/);
  });
  it("release向けPRでは読取権限だけで説明を事前検証する", () => {
    const check = workflow("release-note-check");
    expect(check.on.pull_request.branches).toEqual(["release"]);
    expect(check.permissions.contents).toBe("read");
    expect(JSON.stringify(check)).not.toContain("--publish");
    expect(JSON.stringify(check)).not.toContain("CLOUDFLARE");
  });
});

it("古いジョブだけの再実行でも、各Workerの直前に現行の本番との差分を再検査する", () => {
  const deploy = workflow("deploy");
  for (const [job, deploymentName] of [
    ["deploy-api", "Apply D1 migrations (remote, idempotent)"],
    ["deploy-app", "Deploy app-worker"],
  ]) {
    const steps = deploy.jobs[job].steps as Array<{ name?: string }>;
    const validation = steps.findIndex(
      (step) => step.name === "Validate release note before deployment",
    );
    expect(validation).toBeGreaterThanOrEqual(0);
    expect(validation).toBeLessThan(
      steps.findIndex((step) => step.name === deploymentName),
    );
  }
});
