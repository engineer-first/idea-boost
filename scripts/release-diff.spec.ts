// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readGitReleaseDiff } from "./release-diff.mts";

it("Gitから301件以上の最終差分を取得し、追加・削除・rename・特殊パス・binaryを保持する", () => {
  const directory = mkdtempSync(join(tmpdir(), "release-diff-test-"));
  const git = (args: string[]): string =>
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trimEnd();
  try {
    git(["init"]);
    git(["config", "user.name", "Test"]);
    git(["config", "user.email", "test@example.com"]);
    writeFileSync(join(directory, "old.txt"), "original\n");
    writeFileSync(join(directory, "deleted.txt"), "deleted\n");
    git(["add", "."]);
    git(["commit", "-m", "before"]);
    const previous = git(["rev-parse", "HEAD"]);
    renameSync(join(directory, "old.txt"), join(directory, "new.txt"));
    rmSync(join(directory, "deleted.txt"));
    for (let i = 0; i < 301; i++)
      writeFileSync(join(directory, `file-${i}.txt`), `content-${i}\n`);
    const special = ":(glob)* space\n日本語.txt";
    writeFileSync(join(directory, special), "special\n");
    writeFileSync(join(directory, "binary.bin"), Buffer.from([0, 1, 2]));
    git(["add", "."]);
    git(["commit", "-m", "after"]);
    const candidate = git(["rev-parse", "HEAD"]);
    writeFileSync(join(directory, "file-300.txt"), "uncommitted\n");
    const files = readGitReleaseDiff(git, previous, candidate);
    expect(files).toHaveLength(306);
    expect(
      files.find((file) => file.filename === "file-300.txt")?.patch,
    ).toContain("+content-300");
    expect(
      files.find((file) => file.filename === "file-300.txt")?.patch,
    ).not.toContain("uncommitted");
    expect(files.find((file) => file.filename === special)?.patch).toContain(
      "+special",
    );
    expect(files.find((file) => file.filename === "old.txt")?.status).toBe(
      "removed",
    );
    expect(files.find((file) => file.filename === "new.txt")?.status).toBe(
      "added",
    );
    expect(
      files.find((file) => file.filename === "deleted.txt")?.patch,
    ).toContain("-deleted");
    expect(
      files.find((file) => file.filename === "binary.bin")?.patch,
    ).toContain("Binary files");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("ファイル一覧とpatchの件数が異なれば不完全な差分を返さない", () => {
  const git = (args: string[]): string =>
    args.includes("--name-status") ? "M\0file.txt\0" : "";
  expect(() => readGitReleaseDiff(git, "a".repeat(40), "b".repeat(40))).toThrow(
    "不完全",
  );
});
