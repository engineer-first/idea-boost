// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildFeedback } from "../contracts/feedback.fixture";
import { buildSharedOutcome } from "../contracts/shared-outcomes.fixture";
import {
  D1_EXPORT_DIR,
  d1QueryArgs,
  parseD1ExportArgs,
  runD1Export,
} from "./d1-export.mts";

const ROOM = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_ROOM = "223e4567-e89b-42d3-a456-426614174000";
const NOW = Date.UTC(2026, 10, 14);
const snapshot = buildSharedOutcome().snapshot;

let db: DatabaseSync;
let outDir: string;
const executed: string[] = [];
const query = (sql: string) => {
  executed.push(sql);
  return db.prepare(sql).all() as Array<Record<string, unknown>>;
};
const readJson = (file: string) =>
  JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

beforeEach(() => {
  executed.length = 0;
  outDir = mkdtempSync(join(tmpdir(), "d1-export-"));
  db = new DatabaseSync(":memory:");
  for (const file of readdirSync("workers/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(`workers/migrations/${file}`, "utf8"));
  db.exec(
    "INSERT INTO users(id,email,name) VALUES('u1','owner@example.test','運営 太郎')",
  );
  // 期限切れ（expires_at が過去）と保存失敗（snapshot_json が NULL）も含める。
  db.prepare(
    "INSERT INTO shared_outcomes(room_id,last_used_at,expires_at,snapshot_json,creation_visibility) VALUES(?,?,?,?,'published'),(?,?,?,NULL,'hidden')",
  ).run(
    ROOM,
    NOW - 10,
    NOW + 1000,
    JSON.stringify(snapshot),
    OTHER_ROOM,
    NOW - 20,
    NOW - 1,
  );
  db.prepare(
    "INSERT INTO progress_history_snapshots(room_id,record_id,snapshot_json,expires_at) VALUES(?,?,?,?),(?,?,?,?)",
  ).run(
    ROOM,
    "aaaaaaaa-0000-4000-8000-000000000001",
    JSON.stringify(snapshot),
    NOW + 1000,
    ROOM,
    "aaaaaaaa-0000-4000-8000-000000000002",
    "{壊れたJSON",
    NOW - 1,
  );
  const feedback = buildFeedback({ roomId: ROOM, expiresAt: NOW - 1 });
  db.prepare(
    "INSERT INTO feedback(id,id_hash,room_id,target,kind,body,rating,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)",
  ).run(
    feedback.id,
    "hash",
    feedback.roomId,
    feedback.target,
    feedback.kind,
    feedback.body,
    feedback.rating,
    feedback.createdAt,
    feedback.expiresAt,
  );
});
afterEach(() => {
  db.close();
  rmSync(outDir, { recursive: true, force: true });
});

describe("parseD1ExportArgs", () => {
  it.each([
    [[]],
    [["outcomes"]],
    [["outcomes", "--invalid"]],
    [["delete", "--remote"]],
    [["outcomes", "--remote", "extra"]],
  ])("引数 %j は使い方を示して拒否する", (args) => {
    expect(() => parseD1ExportArgs(args)).toThrow("使い方");
  });
  it("サブコマンドと --local / --remote を受け付ける", () => {
    expect(parseD1ExportArgs(["feedback", "--local"])).toEqual({
      command: "feedback",
      location: "--local",
    });
    expect(parseD1ExportArgs(["all", "--remote"])).toEqual({
      command: "all",
      location: "--remote",
    });
  });
});

describe("d1QueryArgs", () => {
  it("指定した実行対象で D1 を JSON 出力で読む", () => {
    const args = d1QueryArgs("--local", "SELECT 1");
    expect(args).toEqual(
      expect.arrayContaining(["d1", "execute", "DB", "--local", "--json"]),
    );
    expect(args).not.toContain("--remote");
    expect(args.at(-1)).toBe("SELECT 1");
  });
  it.each([
    "DELETE FROM feedback",
    "INSERT INTO users(id) VALUES('x')",
    "SELECT 1; DROP TABLE users",
  ])("読み取り以外の SQL %j は実行しない", (sql) => {
    expect(() => d1QueryArgs("--remote", sql)).toThrow();
  });
});

describe("runD1Export", () => {
  it("成果は期限切れ・保存失敗を含め、盤面を contracts の形で出す", () => {
    const lines = runD1Export({ command: "outcomes", query, outDir, now: NOW });
    const file = join(outDir, "outcomes.json");
    const output = readJson(file);
    expect(output.exportedAt).toBe(NOW);
    expect(output.outcomes).toEqual([
      {
        roomId: ROOM,
        lastUsedAt: NOW - 10,
        expiresAt: NOW + 1000,
        creationVisibility: "published",
        snapshot,
      },
      {
        roomId: OTHER_ROOM,
        lastUsedAt: NOW - 20,
        expiresAt: NOW - 1,
        creationVisibility: "hidden",
        snapshot: null,
      },
    ]);
    expect(output.progressHistory).toEqual([
      {
        roomId: ROOM,
        recordId: "aaaaaaaa-0000-4000-8000-000000000001",
        expiresAt: NOW + 1000,
        snapshot,
      },
      {
        roomId: ROOM,
        recordId: "aaaaaaaa-0000-4000-8000-000000000002",
        expiresAt: NOW - 1,
        snapshot: null,
        invalidSnapshotJson: "{壊れたJSON",
      },
    ]);
    expect(lines).toEqual([`成果 2 件・進行記録 2 件: ${file}`]);
  });

  it("意見は期限切れを含め、成果と roomId で突き合わせられる形で出す", () => {
    const lines = runD1Export({ command: "feedback", query, outDir, now: NOW });
    const file = join(outDir, "feedback.json");
    expect(readJson(file).feedback).toEqual([
      buildFeedback({ roomId: ROOM, expiresAt: NOW - 1 }),
    ]);
    expect(lines).toEqual([`意見 1 件: ${file}`]);
  });

  it("その他のテーブルは利用者のメール・名前を含め、全テーブルの行をそのまま出す", () => {
    const lines = runD1Export({ command: "tables", query, outDir, now: NOW });
    const file = join(outDir, "tables.json");
    const tables = readJson(file).tables as Record<string, unknown[]>;
    const names = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>
    ).map(({ name }) => name);
    expect(Object.keys(tables)).toEqual(names);
    expect(tables.users).toEqual([
      expect.objectContaining({
        id: "u1",
        email: "owner@example.test",
        name: "運営 太郎",
      }),
    ]);
    expect(tables.feedback).toHaveLength(1);
    expect(lines).toEqual([`テーブル ${names.length} 件: ${file}`]);
  });

  it("all は 3 種類のファイルを書き、標準出力には本文を含めない", () => {
    const lines = runD1Export({ command: "all", query, outDir, now: NOW });
    expect(readdirSync(outDir).sort()).toEqual([
      "feedback.json",
      "outcomes.json",
      "tables.json",
    ]);
    expect(lines).toHaveLength(3);
    expect(lines.join("\n")).not.toMatch(
      /owner@example\.test|順番が分かって|待ち時間/,
    );
  });

  it("ページ単位で読み、件数がページ幅を超えても全行を出す", () => {
    for (let i = 0; i < 5; i++)
      db.prepare("INSERT INTO users(id,email) VALUES(?,?)").run(
        `p${i}`,
        `p${i}@example.test`,
      );
    runD1Export({ command: "tables", query, outDir, now: NOW, pageSize: 2 });
    const tables = readJson(join(outDir, "tables.json")).tables as Record<
      string,
      unknown[]
    >;
    expect(tables.users).toHaveLength(6);
    expect(executed.every((sql) => /^SELECT\s/i.test(sql))).toBe(true);
  });
});

it("出力先フォルダは git の追跡対象にならない", () => {
  const probe = join(D1_EXPORT_DIR, "probe.json");
  const result = spawnSync("git", ["check-ignore", "-q", probe]);
  expect(result.status).toBe(0);
});
