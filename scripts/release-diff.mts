import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export type ReleaseFile = {
  filename: string;
  status: string;
  patch?: string;
};
export type ReleaseDiffLoader = (
  previousCommit: string,
  candidate: string,
) => Promise<ReleaseFile[]>;

/** 作業ツリーや可動ブランチを使わず、確定した公開commit間を比較する。 */
export async function gitReleaseDiff(
  previousCommit: string,
  candidate: string,
): Promise<ReleaseFile[]> {
  const commit = z.string().regex(/^[0-9a-f]{40}$/);
  commit.parse(previousCommit);
  commit.parse(candidate);
  const directory = mkdtempSync(join(tmpdir(), "idea-boost-release-"));
  const git = (args: string[]): string =>
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    git(["init", "--bare"]);
    git([
      "fetch",
      "--no-tags",
      "--depth=1",
      "https://github.com/engineer-first/idea-boost.git",
      previousCommit,
      candidate,
    ]);
    return readGitReleaseDiff(git, previousCommit, candidate);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** NUL区切りで空白・改行入りのパスも保ち、renameは削除と追加として全内容を示す。 */
export function readGitReleaseDiff(
  git: (args: string[]) => string,
  previousCommit: string,
  candidate: string,
): ReleaseFile[] {
  const entries = git([
    "diff",
    "--no-renames",
    "--name-status",
    "-z",
    previousCommit,
    candidate,
    "--",
  ]).split("\0");
  const patchText = git([
    "diff",
    "--color=never",
    "--submodule=short",
    "--no-ext-diff",
    "--no-textconv",
    "--no-renames",
    previousCommit,
    candidate,
    "--",
  ]);
  const patches = patchText.split(/(?=^diff --git )/m).filter(Boolean);
  const files: ReleaseFile[] = [];
  const statuses: Record<string, string> = {
    A: "added",
    D: "removed",
    M: "modified",
    T: "changed",
  };
  for (let i = 0; i < entries.length - 1; i += 2) {
    const status = statuses[entries[i]];
    const filename = entries[i + 1];
    if (!status || !filename)
      throw new Error("Git差分のファイル一覧が不正です。");
    files.push({ filename, status, patch: patches[i / 2] });
  }
  if (patches.length !== files.length)
    throw new Error("Git差分のpatch取得が不完全です。");
  return files;
}
