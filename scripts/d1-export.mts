// 運営者が AI エージェントに分析させるため、D1 を読み取り専用で JSON ファイルへ書き出す CLI。
// 本文・メール等は標準出力に出さず、git 無視の出力先に置く。書き込み・削除はしない。
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { FeedbackRecord } from "../contracts/feedback.ts";
// contracts の zod は拡張子なしの相対 import を持ち、素の Node では実行時に読めない。
// 型だけを使い、D1 の JSON はそのまま出す。
import type { SharedOutcomeSnapshot } from "../contracts/shared-outcomes.ts";

export const D1_EXPORT_DIR = ".d1-export";
const COMMANDS = ["outcomes", "feedback", "tables", "all"] as const;
type ExportCommand = (typeof COMMANDS)[number];
type D1Location = "--local" | "--remote";
type Row = Record<string, unknown>;
type Query = (sql: string) => Row[];

export type SharedOutcomeExport = {
  roomId: string;
  lastUsedAt: number;
  expiresAt: number;
  creationVisibility: string;
  snapshot: SharedOutcomeSnapshot | null;
  invalidSnapshotJson?: string;
};
export type ProgressHistoryExport = {
  roomId: string;
  recordId: string;
  expiresAt: number;
  snapshot: SharedOutcomeSnapshot | null;
  invalidSnapshotJson?: string;
};

const USAGE = `使い方: npm run d1:export -- ${COMMANDS.join("|")} --local|--remote`;

export function parseD1ExportArgs(args: string[]): {
  command: ExportCommand;
  location: D1Location;
} {
  const [command, location] = args;
  if (
    args.length !== 2 ||
    !COMMANDS.includes(command as ExportCommand) ||
    (location !== "--local" && location !== "--remote")
  )
    throw new Error(USAGE);
  return { command: command as ExportCommand, location };
}

// 単一の SELECT 文だけを通し、本番 D1 を変更する SQL を組み立てない。
export function d1QueryArgs(location: D1Location, sql: string): string[] {
  if (!/^SELECT\s/i.test(sql) || sql.includes(";"))
    throw new Error("読み取り用の SELECT 文だけを実行できます。");
  return [
    "d1",
    "execute",
    "DB",
    location,
    "--config",
    "workers/wrangler.jsonc",
    "--json",
    "--command",
    sql,
  ];
}

function selectAll(query: Query, sql: string, pageSize: number): Row[] {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = query(`${sql} LIMIT ${pageSize} OFFSET ${offset}`);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

// 壊れた盤面も捨てず、D1 にある文字列のまま添える。
function parseSnapshot(
  json: unknown,
): Pick<SharedOutcomeExport, "snapshot" | "invalidSnapshotJson"> {
  if (json === null) return { snapshot: null };
  try {
    const parsed: unknown = JSON.parse(String(json));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return { snapshot: parsed as SharedOutcomeSnapshot };
  } catch {}
  return { snapshot: null, invalidSnapshotJson: String(json) };
}

function exportOutcomes(query: Query, pageSize: number) {
  const outcomes: SharedOutcomeExport[] = selectAll(
    query,
    "SELECT room_id,last_used_at,expires_at,creation_visibility,snapshot_json FROM shared_outcomes ORDER BY last_used_at DESC,room_id",
    pageSize,
  ).map((row) => ({
    roomId: String(row.room_id),
    lastUsedAt: Number(row.last_used_at),
    expiresAt: Number(row.expires_at),
    creationVisibility: String(row.creation_visibility),
    ...parseSnapshot(row.snapshot_json),
  }));
  const progressHistory: ProgressHistoryExport[] = selectAll(
    query,
    "SELECT room_id,record_id,expires_at,snapshot_json FROM progress_history_snapshots ORDER BY room_id,record_id",
    pageSize,
  ).map((row) => ({
    roomId: String(row.room_id),
    recordId: String(row.record_id),
    expiresAt: Number(row.expires_at),
    ...parseSnapshot(row.snapshot_json),
  }));
  return { outcomes, progressHistory };
}

function exportFeedback(query: Query, pageSize: number) {
  const feedback = selectAll(
    query,
    "SELECT id,room_id AS roomId,target,kind,body,rating,created_at AS createdAt,expires_at AS expiresAt FROM feedback ORDER BY created_at DESC,id DESC",
    pageSize,
  ) as FeedbackRecord[];
  return { feedback };
}

function exportTables(query: Query, pageSize: number) {
  // D1 内部の表（_cf_*）と migration 履歴は運用データではないため除く。
  const names = query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name",
  ).map((row) => String(row.name));
  const tables: Record<string, Row[]> = {};
  for (const name of names)
    tables[name] = selectAll(
      query,
      `SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`,
      pageSize,
    );
  return { tables };
}

export function runD1Export({
  command,
  query,
  outDir,
  now = Date.now(),
  pageSize = 100,
}: {
  command: ExportCommand;
  query: Query;
  outDir: string;
  now?: number;
  pageSize?: number;
}): string[] {
  mkdirSync(outDir, { recursive: true });
  const lines: string[] = [];
  const write = (name: string, body: object) => {
    const file = join(outDir, name);
    writeFileSync(
      file,
      `${JSON.stringify({ exportedAt: now, ...body }, null, 2)}\n`,
    );
    return file;
  };
  if (command === "outcomes" || command === "all") {
    const body = exportOutcomes(query, pageSize);
    const file = write("outcomes.json", body);
    lines.push(
      `成果 ${body.outcomes.length} 件・進行記録 ${body.progressHistory.length} 件: ${file}`,
    );
  }
  if (command === "feedback" || command === "all") {
    const body = exportFeedback(query, pageSize);
    lines.push(
      `意見 ${body.feedback.length} 件: ${write("feedback.json", body)}`,
    );
  }
  if (command === "tables" || command === "all") {
    const body = exportTables(query, pageSize);
    lines.push(
      `テーブル ${Object.keys(body.tables).length} 件: ${write("tables.json", body)}`,
    );
  }
  return lines;
}

function wranglerQuery(root: string, location: D1Location): Query {
  return (sql) => {
    const result = spawnSync(
      process.execPath,
      [
        join(root, "node_modules/wrangler/bin/wrangler.js"),
        ...d1QueryArgs(location, sql),
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
    );
    if (result.status !== 0)
      throw new Error(
        result.stderr || result.stdout || "D1 の読み取りに失敗しました。",
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
    return output[0].results as Row[];
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const { command, location } = parseD1ExportArgs(process.argv.slice(2));
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const stamp = new Date().toISOString().replaceAll(/[-:]|\.\d+/g, "");
    // 標準出力は保存先だけにするため、実行場所からの相対パスで示す。
    const outDir = relative(
      process.cwd(),
      join(root, D1_EXPORT_DIR, `${location.slice(2)}-${stamp}`),
    );
    for (const line of runD1Export({
      command,
      query: wranglerQuery(root, location),
      outDir,
    }))
      console.log(line);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
