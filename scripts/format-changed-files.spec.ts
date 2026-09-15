import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// git の作業ツリー差分 (追跡ファイルの変更 + 未追跡の新規ファイル) から対象を
// 検出するスクリプトのため、テストは実プロジェクトの git リポジトリ内で行う
// (scripts/format-file.sh 自身も自分の設置場所からプロジェクトルートを導出する
// ため、隔離した一時 git リポジトリでは biome/remark に到達できない)。
//
// このスクリプトはリポジトリ全体を git diff/ls-files でスキャンするため、
// フルスイート実行時は他の spec が並行して作る一時ファイルも巻き込んで
// bash -> git -> npx biome/remark と実プロセスを何度も spawn する。CI の
// 並列負荷が高いとデフォルトの 5000ms を超えることがある (ロジックの不具合
// ではなく、実プロセス起動のオーバーヘッドによるもの) ため、余裕を持たせる。
// さらに、多数の spec ファイルが並行して実プロセスを spawn する環境では
// まれに transient な spawn 失敗が起きうる (単独実行では再現しない) ため retry する。
vi.setConfig({ testTimeout: 20000, retry: 2 });

const projectDir = process.cwd();
const scriptPath = join(projectDir, "scripts/format-changed-files.sh");
const tmpRoot = join(projectDir, "tmp");

const createdDirs: string[] = [];
const stagedPaths: string[] = [];

function createScratchDir() {
  mkdirSync(tmpRoot, { recursive: true });
  const dir = mkdtempSync(join(tmpRoot, "format-changed-spec-"));
  createdDirs.push(dir);
  return dir;
}

function runScript() {
  return spawnSync("bash", [scriptPath], {
    cwd: projectDir,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const relPath of stagedPaths.splice(0)) {
    // 一時的に git add したパスをインデックスから外し、リポジトリの状態を戻す。
    try {
      execFileSync("git", ["reset", "--", relPath], { cwd: projectDir });
    } catch {
      // すでに未追跡に戻っている場合は無視する。
    }
  }
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("scripts/format-changed-files.sh", () => {
  it("formats an untracked new Markdown file", () => {
    const dir = createScratchDir();
    const file = join(dir, "note.md");
    writeFileSync(file, "* item one\n");

    const result = runScript();

    expect(result.status).toBe(0);
    expect(readFileSync(file, "utf8")).toContain("- item one");
  });

  it("formats an untracked new TypeScript file", () => {
    const dir = createScratchDir();
    const file = join(dir, "sample.ts");
    writeFileSync(file, "export const greeting = 'hello';\n");

    const result = runScript();

    expect(result.status).toBe(0);
    expect(readFileSync(file, "utf8")).toContain('"hello"');
  });

  it("leaves untracked files with a non-target extension untouched", () => {
    const dir = createScratchDir();
    const file = join(dir, "notes.txt");
    const original = "* item one\n";
    writeFileSync(file, original);

    const result = runScript();

    expect(result.status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("exits 0 when a detected file disappears before formatting", () => {
    const dir = createScratchDir();
    const file = join(dir, "disappeared.md");
    symlinkSync(join(dir, "missing.md"), file);

    const result = runScript();

    expect(result.status).toBe(0);
  });

  it("formats a tracked file that was modified after staging", () => {
    const dir = createScratchDir();
    const file = join(dir, "tracked.md");
    const relPath = file.slice(projectDir.length + 1);
    writeFileSync(file, "already tidy\n");
    execFileSync("git", ["add", relPath], { cwd: projectDir });
    stagedPaths.push(relPath);
    writeFileSync(file, "* item one\n");

    const result = runScript();

    expect(result.status).toBe(0);
    expect(readFileSync(file, "utf8")).toContain("- item one");
  });

  it("exits 0 and keeps earlier successful formatting even when the last file fails (invalid JSON)", () => {
    // 一つのファイルの整形失敗をスクリプト全体の失敗にしない (== 一つの失敗が
    // バッチ内の他ファイルの整形結果を覆さない) ことを確認する。
    // ソート順で最後に処理されるファイル名にしているのは、while ループの
    // 終了コードは最後に実行したコマンドの結果になる (bash の一般的な挙動)
    // ため、"最後のファイルが失敗しても全体は成功扱いになる" ことこそが
    // scripts/format-changed-files.sh 側の || true の効果を検証できるケース
    // だから。
    const dir = createScratchDir();
    const goodFile = join(dir, "a-good.md");
    const badFile = join(dir, "z-bad.json");
    writeFileSync(goodFile, "* item one\n");
    writeFileSync(badFile, "{ invalid json");

    const result = runScript();

    expect(result.status).toBe(0);
    expect(readFileSync(goodFile, "utf8")).toContain("- item one");
  });
});
