// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageRule = {
  matchPackageNames?: string[];
  matchUpdateTypes?: string[];
  matchDepTypes?: string[];
  dependencyDashboardApproval?: boolean;
  matchCurrentVersion?: string;
  groupName?: string;
  automerge?: boolean;
  ignoreUnstable?: boolean;
  respectLatest?: boolean;
};

type RenovateConfig = {
  extends?: string[];
  labels?: string[];
  dependencyDashboard?: boolean | { enabled?: boolean };
  major?: { dependencyDashboardApproval?: boolean; automerge?: boolean };
  packageRules?: PackageRule[];
  vulnerabilityAlerts?: { enabled?: boolean };
  platformAutomerge?: boolean;
  prHourlyLimit?: number;
};

const config: RenovateConfig = JSON.parse(
  readFileSync(new URL("../../renovate.json", import.meta.url), "utf8"),
);
const rules = config.packageRules ?? [];
// npmの依存に加え、package.jsonのnpm本体（packageManager）とmise.tomlの開発ツール（tools）もまとめる。
// overridesやengines（Nodeの範囲）は含めない。
const groupedDepTypes = [
  "dependencies",
  "devDependencies",
  "packageManager",
  "tools",
];
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

  it("メジャーは承認を待たずにPRを作り、自動マージせずエージェントのレビューで取り込む", () => {
    expect(config.dependencyDashboard).toEqual({ enabled: true });
    expect(config.major?.dependencyDashboardApproval).not.toBe(true);
    expect(config.major?.automerge).not.toBe(true);
    for (const rule of rules) {
      if (rule.matchUpdateTypes?.includes("major")) {
        expect(rule.automerge).not.toBe(true);
      }
    }
  });

  it("TypeScriptのメジャーは移行Issue (#738) の条件を満たすまでDashboardで承認した時だけPRにする", () => {
    const typescript = rules.find(
      (rule) =>
        rule.matchPackageNames?.includes("typescript") &&
        rule.matchUpdateTypes?.includes("major"),
    );
    expect(typescript?.dependencyDashboardApproval).toBe(true);
    expect(typescript?.automerge).not.toBe(true);
  });

  it("1.0以上のパッチを1つのPRにまとめる", () => {
    const patch = groupFor("patch");
    expect(patch?.groupName).toBeTruthy();
    expect(patch?.matchCurrentVersion).toBe("!/^0/");
  });

  it("1.0以上のマイナーはパッチと別の1つのPRにまとめ、必須チェックの成功後に自動マージする", () => {
    const minor = groupFor("minor");
    expect(minor?.groupName).toBeTruthy();
    expect(minor?.groupName).not.toBe(groupFor("patch")?.groupName);
    expect(minor?.matchCurrentVersion).toBe("!/^0/");
    expect(minor?.matchDepTypes).toEqual(groupedDepTypes);
    expect(minor?.automerge).toBe(true);
  });

  it("1.0以上のパッチは必須チェックの成功後に自動マージする", () => {
    const patch = groupFor("patch");
    expect(patch?.automerge).toBe(true);
    expect(config.platformAutomerge).not.toBe(false);
  });

  it("overridesの固定版はまとめPRに混ぜず、Dashboardで承認した時だけ更新する", () => {
    const patch = groupFor("patch");
    expect(patch?.matchDepTypes).toEqual(groupedDepTypes);
    const overrides = rules.find((rule) =>
      rule.matchDepTypes?.includes("overrides"),
    );
    expect(overrides?.dependencyDashboardApproval).toBe(true);
    expect(overrides?.automerge).not.toBe(true);
  });

  it("自動マージは1.0以上のパッチとマイナーだけにする", () => {
    for (const rule of rules) {
      if (rule.automerge === true) {
        expect([["patch"], ["minor"]]).toContainEqual(rule.matchUpdateTypes);
        expect(rule.matchCurrentVersion).toBe("!/^0/");
      }
    }
  });

  it("Wrangler・Vitest plugin・直接のMiniflareは同じPRで更新し、Miniflareの版がずれないようにする (#739)", () => {
    const groups = ["wrangler", "@cloudflare/vitest-plugin", "miniflare"].map(
      (name) =>
        rules.findLast(
          (rule) => rule.matchPackageNames?.includes(name) && rule.groupName,
        )?.groupName,
    );
    expect(groups[0]).toBeTruthy();
    expect(new Set(groups).size).toBe(1);
  });

  it("Wranglerが同梱するMiniflareはbetaタグの版なので、beta間の更新にも追従する (#739)", () => {
    const miniflare = rules.findLast(
      (rule) =>
        rule.matchPackageNames?.includes("miniflare") &&
        rule.ignoreUnstable !== undefined,
    );
    expect(miniflare?.ignoreUnstable).toBe(false);
    expect(miniflare?.respectLatest).toBe(false);
  });

  it("まとめPRが1時間あたりの作成数の上限で翌朝へ持ち越されないようにする", () => {
    expect(config.prHourlyLimit).toBe(0);
  });

  it("脆弱性アラートからの修正PRを無効にしない", () => {
    expect(config.vulnerabilityAlerts?.enabled).not.toBe(false);
  });
});
