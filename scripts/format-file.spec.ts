import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// scripts/format-file.sh は自身の設置場所 (BASH_SOURCE) からプロジェクトルートを
// 導出するため、テスト用の一時ファイルも実プロジェクトツリー配下
// (tmp/format-file-spec-*) に作る必要がある。System tmpdir には置けない
// (PROJECT_DIR 外として早期 exit されてしまうため)。
//
// bash -> npx biome/remark と実プロセスを spawn するため、フルスイート実行時の
// 並列負荷が高いとデフォルトの 5000ms を超えることがある。ロジックの不具合では
// なく実プロセス起動のオーバーヘッドによるものなので、余裕を持たせる。
// さらに、多数の spec ファイルが並行して実プロセスを spawn する環境では
// まれに transient な spawn 失敗が起きうる (単独実行では再現しない) ため retry する。
vi.setConfig({ testTimeout: 15000, retry: 2 });

const projectDir = process.cwd();
const scriptPath = join(projectDir, "scripts/format-file.sh");
const tmpRoot = join(projectDir, "tmp");

const createdDirs: string[] = [];

function createScratchDir() {
  mkdirSync(tmpRoot, { recursive: true });
  const dir = mkdtempSync(join(tmpRoot, "format-file-spec-"));
  createdDirs.push(dir);
  return dir;
}

function runScript(filePath: string) {
  return spawnSync("bash", [scriptPath, filePath], {
    cwd: projectDir,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("scripts/format-file.sh", () => {
  it("formats a Markdown file with remark", () => {
    const dir = createScratchDir();
    const file = join(dir, "note.md");
    writeFileSync(file, "# Title\n\n* item one\n* item two\n");

    const result = runScript(file);

    expect(result.status).toBe(0);
    const formatted = readFileSync(file, "utf8");
    expect(formatted).toContain("- item one");
    expect(formatted).not.toContain("* item one");
  });

  it.each(["ts", "mts", "cts"])("formats a %s file with biome", (extension) => {
    const dir = createScratchDir();
    const file = join(dir, `sample.${extension}`);
    writeFileSync(file, "export const greeting = 'hello';\n");

    const result = runScript(file);

    expect(result.status).toBe(0);
    const formatted = readFileSync(file, "utf8");
    expect(formatted).toContain('"hello"');
  });

  it("skips AGENTS.md even when passed an absolute path inside the project", () => {
    const dir = createScratchDir();
    const file = join(dir, "AGENTS.md");
    const original = "* not-a-guideline-bullet\n";
    writeFileSync(file, original);

    const result = runScript(file);

    expect(result.status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("skips files under node_modules", () => {
    const dir = createScratchDir();
    const nestedDir = join(dir, "node_modules", "pkg");
    mkdirSync(nestedDir, { recursive: true });
    const file = join(nestedDir, "sample.ts");
    const original = "export const greeting = 'hello';\n";
    writeFileSync(file, original);

    const result = runScript(file);

    expect(result.status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("skips absolute paths outside the project directory", () => {
    const outsideDir = mkdtempSync(join(tmpdir(), "format-file-outside-"));
    const file = join(outsideDir, "note.md");
    const original = "* item one\n";
    writeFileSync(file, original);

    try {
      const result = runScript(file);

      expect(result.status).toBe(0);
      expect(readFileSync(file, "utf8")).toBe(original);
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("rejects a relative path that traverses outside the project directory via ..", () => {
    const outsideDir = mkdtempSync(join(tmpdir(), "format-file-outside-"));
    const file = join(outsideDir, "note.md");
    // remark はデフォルト設定でも末尾空白や余分な空行を正規化するため、
    // 素通りしていれば必ず書き換わる内容にしてプロジェクト外への書き込みを検出する。
    const original = "#  Title  \n\n\n\n* item one\n* item two   \n";
    writeFileSync(file, original);

    try {
      const relativePath = relative(projectDir, file);

      const result = runScript(relativePath);

      expect(result.status).toBe(0);
      expect(readFileSync(file, "utf8")).toBe(original);
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("resolves a project-relative path against the project root", () => {
    const dir = createScratchDir();
    const file = join(dir, "note.md");
    writeFileSync(file, "* item one\n");
    const relativePath = join("tmp", dir.slice(tmpRoot.length + 1), "note.md");

    const result = runScript(relativePath);

    expect(result.status).toBe(0);
    expect(readFileSync(file, "utf8")).toContain("- item one");
  });

  it("exits non-zero when called without a file argument", () => {
    const result = spawnSync("bash", [scriptPath], {
      cwd: projectDir,
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
  });
});
