// 運用者が D1 の既存ユーザーに権限を付与・剥奪するための明示的な CLI。
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PERMISSIONS } from "../contracts/access.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js");
const allowed = Object.values(PERMISSIONS);
type Command = "grant" | "revoke" | "list";

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
function execute(sql: string): Array<Record<string, unknown>> {
  const result = spawnSync(
    process.execPath,
    [
      wrangler,
      "d1",
      "execute",
      "DB",
      "--remote",
      "--config",
      join(root, "workers/wrangler.jsonc"),
      "--json",
      "--command",
      sql,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(
      result.stderr || result.stdout || "D1 操作に失敗しました。",
    );
  const output: unknown = JSON.parse(result.stdout);
  if (
    !Array.isArray(output) ||
    !output[0] ||
    typeof output[0] !== "object" ||
    !("results" in output[0]) ||
    !Array.isArray(output[0].results) ||
    !("success" in output[0]) ||
    output[0].success !== true
  )
    throw new Error("D1 の応答を読み取れませんでした。");
  return output[0].results as Array<Record<string, unknown>>;
}

export function run(
  command: Command,
  permission?: string,
  email?: string,
): void {
  if (!["grant", "revoke", "list"].includes(command))
    throw new Error("操作は grant / revoke / list のいずれかです。");
  if (command === "list") {
    if (permission || email) throw new Error("使い方: npm run access:list");
    for (const row of execute(
      "SELECT users.email, users.name, user_permissions.permission FROM user_permissions JOIN users ON users.id = user_permissions.user_id ORDER BY users.email, user_permissions.permission",
    ))
      console.log(`${row.email}\t${row.name ?? ""}\t${row.permission}`);
    return;
  }
  if (
    !permission ||
    !allowed.includes(permission as (typeof allowed)[number]) ||
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    throw new Error(
      `使い方: npm run access:${command} -- shared_outcomes:read|shared_outcomes:manage_access email@example.com`,
    );
  const user = execute(
    `SELECT id FROM users WHERE lower(email) = lower(${sqlLiteral(email)}) LIMIT 1`,
  )[0];
  if (!user || typeof user.id !== "string")
    throw new Error(
      "このユーザーはまだ Idea Boost に登録されていません。先に本番へ Google ログインしてください。",
    );
  const statement =
    command === "grant"
      ? `INSERT OR IGNORE INTO user_permissions(user_id,permission) VALUES(${sqlLiteral(user.id)},${sqlLiteral(permission)})`
      : `DELETE FROM user_permissions WHERE user_id=${sqlLiteral(user.id)} AND permission=${sqlLiteral(permission)}`;
  execute(statement);
  console.log(
    `${command === "grant" ? "付与" : "剥奪"}: ${email} ${permission}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.argv.length > (process.argv[2] === "list" ? 3 : 5))
      throw new Error("引数が多すぎます。");
    run(process.argv[2] as Command, process.argv[3], process.argv[4]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
