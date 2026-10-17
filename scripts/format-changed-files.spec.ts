// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts/format-changed-files.sh");
const roots: string[] = [];

function git(root: string, ...args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "pipe" });
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "format changed "));
  roots.push(root);
  git(root, "init", "-q");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.test");
  mkdirSync(join(root, "scripts"));
  // 対象選択だけを観測する。実際のBiome/remark整形はformat-file.spec.tsで検証する。
  writeFileSync(
    join(root, "scripts/format-file.sh"),
    'printf "%s\\0" "$1" >> .git/format-calls\n[[ "$1" != "bad.json" ]]\n',
  );
  writeFileSync(join(root, ".git/format-calls"), "");
  writeFileSync(join(root, ".gitignore"), "ignored.md\n");
  writeFileSync(join(root, "tracked.md"), "original\n");
  git(root, "add", ".");
  git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture");
  return root;
}

function run(root: string): string[] {
  const result = spawnSync("bash", [script], { cwd: root, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return readFileSync(join(root, ".git/format-calls"), "utf8")
    .split("\0")
    .filter(Boolean);
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("Codex整形対象の検出", () => {
  it("追跡ファイルの未stage変更と未追跡ファイルを整形する", () => {
    const root = fixture();
    writeFileSync(join(root, "tracked.md"), "changed\n");
    writeFileSync(join(root, "new.ts"), "new\n");
    expect(run(root).sort()).toEqual(["new.ts", "tracked.md"]);
  });

  it("stage済みの変更・追加も整形する", () => {
    const root = fixture();
    writeFileSync(join(root, "tracked.md"), "changed\n");
    writeFileSync(join(root, "new.mts"), "new\n");
    git(root, "add", "tracked.md", "new.mts");
    expect(run(root).sort()).toEqual(["new.mts", "tracked.md"]);
  });

  it("stage後に再編集したファイルを一度だけ処理する", () => {
    const root = fixture();
    writeFileSync(join(root, "tracked.md"), "staged\n");
    git(root, "add", "tracked.md");
    writeFileSync(join(root, "tracked.md"), "unstaged\n");
    expect(run(root)).toEqual(["tracked.md"]);
  });

  it("日本語・空白・改行のあるファイル名を壊さず渡す", () => {
    const root = fixture();
    const names = ["作業 メモ.md", "line\nbreak.ts", "script.cts"];
    for (const name of names) writeFileSync(join(root, name), "new\n");
    expect(run(root).sort()).toEqual(names.sort());
  });

  it("変更なし・対象外拡張子・gitignore・削除ファイルは整形しない", () => {
    const root = fixture();
    rmSync(join(root, "tracked.md"));
    writeFileSync(join(root, "notes.txt"), "new\n");
    writeFileSync(join(root, "ignored.md"), "new\n");
    expect(run(root)).toEqual([]);
  });

  it("symlinkの参照先を整形しない", () => {
    const root = fixture();
    symlinkSync("tracked.md", join(root, "alias.md"));
    expect(run(root)).toEqual([]);
  });

  it("一つの整形失敗後も残りを処理する", () => {
    const root = fixture();
    writeFileSync(join(root, "bad.json"), "bad\n");
    writeFileSync(join(root, "good.md"), "good\n");
    expect(run(root).sort()).toEqual(["bad.json", "good.md"]);
  });
});
