// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageRule = {
  matchUpdateTypes?: string[];
  matchCurrentVersion?: string;
  groupName?: string;
  automerge?: boolean;
};

type RenovateConfig = {
  extends?: string[];
  labels?: string[];
  dependencyDashboard?: boolean;
  major?: { dependencyDashboardApproval?: boolean; automerge?: boolean };
  packageRules?: PackageRule[];
  vulnerabilityAlerts?: { enabled?: boolean };
};

const config: RenovateConfig = JSON.parse(
  readFileSync(new URL("../../renovate.json", import.meta.url), "utf8"),
);
const rules = config.packageRules ?? [];

describe("Renovateの更新方針 (#395)", () => {
  it("open PR一覧で見分けられるよう、依存更新PRにラベルを付ける", () => {
    expect(config.labels).toContain("dependencies");
  });

  it("npmの版は公開から3日たってから取り込む", () => {
    expect(config.extends).toContain("security:minimumReleaseAgeNpm");
  });

  it("メジャーはDependency Dashboardで承認した時だけPRにし、自動マージしない", () => {
    expect(config.dependencyDashboard).not.toBe(false);
    expect(config.major?.dependencyDashboardApproval).toBe(true);
    expect(config.major?.automerge).not.toBe(true);
    for (const rule of rules) {
      if (rule.matchUpdateTypes?.includes("major")) {
        expect(rule.automerge).not.toBe(true);
      }
    }
  });

  it("1.0以上のパッチを1つのPRにまとめる", () => {
    const patch = rules.find(
      (rule) =>
        rule.matchUpdateTypes?.length === 1 &&
        rule.matchUpdateTypes[0] === "patch",
    );
    expect(patch?.groupName).toBeTruthy();
    expect(patch?.matchCurrentVersion).toBe("!/^0/");
  });

  it("パッチ以外は自動マージの対象にしない", () => {
    for (const rule of rules) {
      if (rule.automerge === true) {
        expect(rule.matchUpdateTypes).toEqual(["patch"]);
        expect(rule.matchCurrentVersion).toBe("!/^0/");
      }
    }
  });

  it("脆弱性アラートからの修正PRを無効にしない", () => {
    expect(config.vulnerabilityAlerts?.enabled).not.toBe(false);
  });
});
