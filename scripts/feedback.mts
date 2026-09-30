// 意見の緊急削除。実行対象を明示し、本文や投稿者情報を出力しない。
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isUuid } from "../contracts/ids.ts";
import { feedbackDeletionSql } from "../workers/lib/feedback-receipt.ts";
export async function feedbackDeleteArgs(args: string[]): Promise<string[]> {
  const [operation, id, location] = args;
  if (
    args.length !== 3 ||
    operation !== "delete" ||
    !id ||
    !isUuid(id) ||
    (location !== "--local" && location !== "--remote")
  )
    throw new Error(
      "使い方: npm run feedback:delete -- 受付ID --local|--remote",
    );
  return [
    "d1",
    "execute",
    "DB",
    location,
    "--config",
    "workers/wrangler.jsonc",
    "--command",
    await feedbackDeletionSql(id),
  ];
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const result = spawnSync(
      process.execPath,
      [
        join(root, "node_modules/wrangler/bin/wrangler.js"),
        ...(await feedbackDeleteArgs(process.argv.slice(2))),
      ],
      { cwd: root, stdio: "inherit" },
    );
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
