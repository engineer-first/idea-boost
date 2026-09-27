import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Operation = "issue" | "rotate" | "revoke";
async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}
export async function manageLocalOutcomesToken(
  path: string,
  operation: Operation,
): Promise<string | null> {
  const previous = await readOptional(path);
  const existing = previous.match(
    /^SHARED_OUTCOMES_TOKEN=([a-f0-9]{64})$/m,
  )?.[1];
  if (operation === "issue" && existing) return existing;
  const token = operation === "revoke" ? null : randomBytes(32).toString("hex");
  const remaining = previous
    .split("\n")
    .filter((line) => !/^SHARED_OUTCOMES_TOKEN=/.test(line))
    .join("\n")
    .replace(/\n*$/, "");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(
    path,
    `${remaining ? `${remaining}\n` : ""}${token ? `SHARED_OUTCOMES_TOKEN=${token}\n` : ""}`,
    { mode: 0o600 },
  );
  await chmod(path, 0o600);
  return token;
}
async function wranglerSecret(
  operation: Operation,
  token: string | null,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "secret",
        operation === "revoke" ? "delete" : "put",
        "SHARED_OUTCOMES_TOKEN",
        "--config",
        "workers/wrangler.jsonc",
      ],
      {
        stdio: ["pipe", process.stderr, process.stderr],
        env: { ...process.env, CI: "true" },
      },
    );
    child.stdin.end(token ? `${token}\n` : "y\n");
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error("秘密設定の更新に失敗しました。")),
    );
  });
}
async function main(): Promise<void> {
  const [operation, target, site, ...extra] = process.argv.slice(2);
  if (
    !["issue", "rotate", "revoke"].includes(operation) ||
    !["local", "verification", "production"].includes(target) ||
    extra.length > 0 ||
    (operation === "revoke" && site !== undefined)
  )
    throw new Error(
      "使い方: npm run outcomes:link -- issue|rotate|revoke local|verification|production [サイトURL]",
    );
  if (operation !== "revoke" && !site)
    throw new Error("サイトURLを指定してください。");
  const op = operation as Operation;
  const linkUrl = site ? new URL("/shared-outcomes", site) : null;
  if (linkUrl && !["http:", "https:"].includes(linkUrl.protocol))
    throw new Error("HTTP(S)のサイトURLを指定してください。");
  if (target === "production" && linkUrl && linkUrl.protocol !== "https:")
    throw new Error("本番のサイトURLにはHTTPSを指定してください。");
  let token: string | null;
  if (target === "production") {
    // issueも設定変更を伴う。既存設定を保持する場合は発行済みリンクを継続利用する。
    token = op === "revoke" ? null : randomBytes(32).toString("hex");
    await wranglerSecret(op, token);
  } else if (target === "verification") {
    const path = join(process.cwd(), ".wrangler/verification/outcomes-token");
    const existing = (await readOptional(path)).trim();
    token =
      op === "revoke"
        ? null
        : op === "issue" && /^[a-f0-9]{64}$/.test(existing)
          ? existing
          : randomBytes(32).toString("hex");
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    if (token) {
      await writeFile(path, token, { mode: 0o600 });
      await chmod(path, 0o600);
    } else await rm(path, { force: true });
  } else
    token = await manageLocalOutcomesToken(
      join(process.cwd(), "workers/.dev.vars"),
      op,
    );
  if (token && linkUrl) {
    linkUrl.hash = `token=${token}`;
    // 明示的な管理コマンドの実行時だけ、登録した秘密に対応するURLを返す。
    console.log(linkUrl.href);
  } else console.log("閲覧設定を削除しました。");
  if (target !== "production")
    console.error(
      "起動中のサーバーを再起動すると変更が反映されます。検証環境は閲覧設定がなければ次回起動時に新規発行します。",
    );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(() => {
    console.error(
      "閲覧設定の操作に失敗しました。引数・管理者の接続設定を確認してください。",
    );
    process.exitCode = 1;
  });
}
