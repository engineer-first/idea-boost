// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageRule = {
  matchUpdateTypes?: string[];
  matchDepTypes?: string[];
  dependencyDashboardApproval?: boolean;
  matchCurrentVersion?: string;
  groupName?: string;
  automerge?: boolean;
};

type RenovateConfig = {
  extends?: string[];
  labels?: string[];
  dependencyDashboard?: boolean | { enabled?: boolean };
  major?: { dependencyDashboardApproval?: boolean; automerge?: boolean };
  packageRules?: PackageRule[];
  vulnerabilityAlerts?: { enabled?: boolean };
  platformAutomerge?: boolean;
};

const config: RenovateConfig = JSON.parse(
  readFileSync(new URL("../../renovate.json", import.meta.url), "utf8"),
);
const rules = config.packageRules ?? [];
const groupFor = (updateType: string): PackageRule | undefined =>
  rules.find(
    (rule) =>
      rule.matchUpdateTypes?.length === 1 &&
      rule.matchUpdateTypes[0] === updateType,
  );

describe("Renovateの更新方針 (#395)", () => {
  it("open PR一覧で見分けられるよう、依存更新PRにラベルを付ける", () => {
    expect(config.labels).toContain("dependencies");
  });

  it("npmの版は公開から3日たってから取り込む", () => {
    expect(config.extends).toContain("security:minimumReleaseAgeNpm");
  });

  it("メジャーはDependency Dashboardで承認した時だけPRにし、自動マージしない", () => {
    expect(config.dependencyDashboard).toEqual({ enabled: true });
    expect(config.major?.dependencyDashboardApproval).toBe(true);
    expect(config.major?.automerge).not.toBe(true);
    for (const rule of rules) {
      if (rule.matchUpdateTypes?.includes("major")) {
        expect(rule.automerge).not.toBe(true);
      }
    }
  });

  it("1.0以上のパッチを1つのPRにまとめる", () => {
    const patch = groupFor("patch");
    expect(patch?.groupName).toBeTruthy();
    expect(patch?.matchCurrentVersion).toBe("!/^0/");
  });

  it("1.0以上のマイナーはパッチと別の1つのPRにまとめ、自動マージしない", () => {
    const minor = groupFor("minor");
    expect(minor?.groupName).toBeTruthy();
    expect(minor?.groupName).not.toBe(groupFor("patch")?.groupName);
    expect(minor?.matchCurrentVersion).toBe("!/^0/");
    expect(minor?.matchDepTypes).toEqual(["dependencies", "devDependencies"]);
    expect(minor?.automerge).not.toBe(true);
  });

  it("1.0以上のパッチは必須チェックの成功後に自動マージする", () => {
    const patch = groupFor("patch");
    expect(patch?.automerge).toBe(true);
    expect(config.platformAutomerge).not.toBe(false);
  });

  it("overridesの固定版はまとめPRに混ぜず、Dashboardで承認した時だけ更新する", () => {
    const patch = groupFor("patch");
    expect(patch?.matchDepTypes).toEqual(["dependencies", "devDependencies"]);
    const overrides = rules.find((rule) =>
      rule.matchDepTypes?.includes("overrides"),
    );
    expect(overrides?.dependencyDashboardApproval).toBe(true);
    expect(overrides?.automerge).not.toBe(true);
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
