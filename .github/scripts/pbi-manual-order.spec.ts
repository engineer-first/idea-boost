import { existsSync, readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("共有された手動順のPBIを別の数値へ同期する実行・デプロイ経路を持たない", () => {
  const writers = readdirSync(".github/workflows").filter((name) =>
    /syncPbiPriority|sync-pbi-priority|idea-boost-pbi-priority/.test(
      readFileSync(`.github/workflows/${name}`, "utf8"),
    ),
  );
  expect(writers).toEqual([]);
  expect(existsSync(".github/scripts/sync-pbi-priority.js")).toBe(false);
  expect(existsSync("workers/pbi-priority/wrangler.jsonc")).toBe(false);
});
