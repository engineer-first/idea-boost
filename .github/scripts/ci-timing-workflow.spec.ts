// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Step = {
  id?: string;
  name?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
};
type Job = { if?: string; needs?: string; steps: Step[] };
type Workflow = {
  name: string;
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
};

function workflow(name: string): Workflow {
  return parse(
    readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8"),
  ) as Workflow;
}

const ci = workflow("ci.yml");
const browser = workflow("browser.yml");

describe("PRごとのCIで待つ検査", () => {
  it("browser は CI から分け、PR Preview が browser の完了を待たない", () => {
    // Preview は name: CI の成功を待つ。browser を同じ workflow に置くと公開が10分以上遅れる。
    expect(ci.jobs).not.toHaveProperty("browser");
    expect(browser.name).not.toBe("CI");
  });

  it("必須チェック名 browser は別 workflow の同名ジョブが常に報告する", () => {
    // 必須チェックは workflow ごと起動しないと pending のまま残る。
    // workflow は常に起動し、対象外の PR ではステップだけを飛ばしてジョブを成功で終える。
    expect(Object.keys(browser.jobs)).toEqual(["browser"]);
    expect(browser.jobs.browser.if).toBeUndefined();
    expect(browser.on).toHaveProperty("pull_request");
    expect(browser.on).not.toHaveProperty("pull_request.paths");
  });

  it("browser は develop へのマージ後と、画面に関わる PR・mobile ラベルの PR で回す", () => {
    expect(browser.on).toHaveProperty("push.branches", ["develop"]);
    const scope = browser.jobs.browser.steps.find((s) => s.id === "scope");
    expect(scope?.run).toContain("scripts/ci-scope.mts");
    expect(scope?.run).toContain("mobile");
    const check = browser.jobs.browser.steps.find(
      (s) => s.name === "Check board layout in Chromium",
    );
    expect(check?.if).toContain("steps.scope.outputs.browser == 'true'");
    expect(check?.env?.BROWSER_MOBILE).toContain("steps.scope.outputs.mobile");
  });

  it("worker 系のテストは関係する変更がある PR と develop へのマージ後だけ回す", () => {
    const steps = ci.jobs.test.steps;
    expect(steps.find((s) => s.id === "scope")?.run).toContain(
      "scripts/ci-scope.mts",
    );
    for (const name of [
      "Run worker tests (Durable Objects / D1)",
      "Run Preview authentication and sample worker tests",
      "Run local verification worker tests",
    ]) {
      expect(steps.find((s) => s.name === name)?.if).toBe(
        "steps.scope.outputs.workers == 'true'",
      );
    }
    expect(steps.find((s) => s.name === "Run unit tests")?.if).toBeUndefined();
  });

  it("smoke は PR では build 内の preview-smoke に任せ、develop へのマージ後だけ回す", () => {
    // build は PR ごとに Preview bundle を workerd で起動して疎通を確かめている。
    // 本番構成の smoke は develop へのマージ後と deploy の gate で確かめる。
    expect(ci.jobs.smoke.if).toBe("github.event_name == 'push'");
    expect(
      ci.jobs.build.steps.some((s) => s.run?.includes("preview-smoke.mts")),
    ).toBe(true);
  });
});
