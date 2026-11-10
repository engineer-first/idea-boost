// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type MiseActionInputs = {
  cache?: boolean;
  cache_max_age_days?: number;
};

type Workflow = {
  jobs?: Record<
    string,
    { steps?: { uses?: string; with?: MiseActionInputs }[] }
  >;
};

const directory = new URL("../workflows/", import.meta.url);

// pull_request / push だけで動き、公開物を作らないworkflow。
// それ以外（デプロイ・リリース記録・pull_request_target / workflow_run）は、
// 低信頼の実行が書いたcacheを取り込まないようcacheを使わない。
const cacheableWorkflows = new Set(["ci.yml", "chromatic.yml"]);

describe("CIのNodeセキュリティ更新と外部ダウンロード", () => {
  for (const name of readdirSync(directory).filter((name) =>
    name.endsWith(".yml"),
  )) {
    const workflow = parse(
      readFileSync(new URL(name, directory), "utf8"),
    ) as Workflow;
    for (const [job, config] of Object.entries(workflow.jobs ?? {})) {
      for (const [index, step] of (config.steps ?? []).entries()) {
        if (!step.uses?.startsWith("jdx/mise-action@")) continue;
        const label = `${name}の${job}（step ${index + 1}）`;

        it(`${label}はGitHub配布の失敗時に別の配布元へ切り替えられるv5を使う`, () => {
          expect(step.uses).toBe("jdx/mise-action@v5");
        });

        if (cacheableWorkflows.has(name)) {
          it(`${label}は毎日cacheを作り直して24系の修正版へ追従する`, () => {
            // mise installは導入済みの24系を優先する。cacheを1日で捨てて、
            // 修正版の公開から1日以内に新しい版を解決する。
            expect(step.with?.cache).not.toBe(false);
            expect(step.with?.cache_max_age_days).toBe(1);
          });
        } else {
          it(`${label}はcacheを使わない`, () => {
            expect(step.with?.cache).toBe(false);
          });
        }
      }
    }
  }
});
