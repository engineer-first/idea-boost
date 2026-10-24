// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Workflow = {
  jobs?: Record<
    string,
    { steps?: { uses?: string; with?: { cache?: boolean } }[] }
  >;
};

const directory = new URL("../workflows/", import.meta.url);

describe("CIのNodeセキュリティ更新", () => {
  for (const name of readdirSync(directory).filter((name) =>
    name.endsWith(".yml"),
  )) {
    const workflow = parse(
      readFileSync(new URL(name, directory), "utf8"),
    ) as Workflow;
    for (const [job, config] of Object.entries(workflow.jobs ?? {})) {
      for (const [index, step] of (config.steps ?? []).entries()) {
        if (!step.uses?.startsWith("jdx/mise-action@")) continue;
        it(`${name}の${job}（step ${index + 1}）は古いNodeをキャッシュから復元しない`, () => {
          // mise installは導入済みの24系を優先する。設定のhashが同じでも
          // 新しいセキュリティ修正版を解決するため、tool cacheを使わない。
          expect(step.with?.cache).toBe(false);
        });
      }
    }
  }
});
