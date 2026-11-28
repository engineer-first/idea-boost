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
type Job = {
  if?: string;
  needs?: string | string[];
  strategy?: { "fail-fast"?: boolean; matrix: Record<string, unknown[]> };
  steps: Step[];
};
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
    expect(Object.keys(browser.jobs).sort()).toEqual(["browser", "shard"]);
    expect(browser.on).toHaveProperty("pull_request");
    expect(browser.on).not.toHaveProperty("pull_request.paths");
    expect(browser.jobs.shard.if).toBeUndefined();
  });

  it("browser は分割して並列に回し、同名の集約ジョブが全分割の成功を報告する", () => {
    // 律速だった browser（約7分）を分けて待ち時間を縮める。必須チェックの名前は変えない。
    const shard = browser.jobs.shard;
    expect(shard.strategy?.["fail-fast"]).toBe(false);
    expect(shard.strategy?.matrix.shard?.length).toBeGreaterThanOrEqual(3);
    const check = shard.steps.find(
      (s) => s.name === "Check board layout in Chromium",
    );
    expect(check?.run).toContain("--shard=");
    // 集約ジョブは分割が落ちても・飛んでも必ず走り、成功以外を失敗として報告する。
    const gate = browser.jobs.browser;
    expect(gate.needs).toEqual(["shard"]);
    expect(gate.if).toContain("!cancelled()");
    expect(JSON.stringify(gate.steps)).toContain("needs.shard.result");
  });

  it("browser は develop へのマージ後と、画面に関わる PR・mobile ラベルの PR で回す", () => {
    expect(browser.on).toHaveProperty("push.branches", ["develop"]);
    const scope = browser.jobs.shard.steps.find((s) => s.id === "scope");
    expect(scope?.run).toContain("scripts/ci-scope.mts");
    expect(scope?.run).toContain("mobile");
    const check = browser.jobs.shard.steps.find(
      (s) => s.name === "Check board layout in Chromium",
    );
    expect(check?.if).toContain("steps.scope.outputs.browser == 'true'");
    expect(check?.env?.BROWSER_MOBILE).toContain("steps.scope.outputs.mobile");
  });

  it("unit は分割して並列に回し、必須チェック test は unit と worker 系の成功を集約する", () => {
    const unit = ci.jobs.unit;
    expect(unit.strategy?.["fail-fast"]).toBe(false);
    expect(unit.strategy?.matrix.shard?.length).toBeGreaterThanOrEqual(2);
    const run = unit.steps.find((s) => s.name === "Run unit tests");
    expect(run?.run).toContain("--shard=");
    expect(run?.if).toBeUndefined();
    const gate = ci.jobs.test;
    expect(gate.needs).toEqual(["unit", "workers"]);
    expect(gate.if).toContain("!cancelled()");
    const script = JSON.stringify(gate.steps);
    expect(script).toContain("needs.unit.result");
    expect(script).toContain("needs.workers.result");
  });

  it("worker 系のテストは関係する変更がある PR と develop へのマージ後だけ回す", () => {
    const steps = ci.jobs.workers.steps;
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

describe("CIのテストのログ", () => {
  it("unit・worker 系・browser のテストは失敗したものだけをログに出す", () => {
    // 通ったファイルの一覧や通ったテストの console を流すと、1ジョブで数百行になり、
    // 失敗を調べるエージェントが長いログを読み込む。注釈（github-actions）は残す。
    const steps = [
      ...ci.jobs.unit.steps.filter((s) => s.name === "Run unit tests"),
      ...ci.jobs.workers.steps.filter((s) => s.run?.startsWith("npm run test")),
      ...browser.jobs.shard.steps.filter(
        (s) => s.name === "Check board layout in Chromium",
      ),
    ];
    expect(steps).toHaveLength(5);
    for (const step of steps) {
      expect(step.run).toContain("--reporter=minimal");
      expect(step.run).toContain("--reporter=github-actions");
    }
  });
});
