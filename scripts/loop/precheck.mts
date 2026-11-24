// Orca automation の precheck。exit 0 のときだけ agent を起こし、やることが無い周回の起動と課金を避ける。
// 条件の正本は docs/loop/README.md。ここは判定と、GitHub から状態を集める処理だけを持つ。
// 使い方: node scripts/loop/precheck.mts patrol
//   automation からは origin/develop の precheck.mts を一時ディレクトリへ書き出して実行する。
//   ほかのファイルを import しない（1ファイルだけを書き出して動かすため）。
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Decision = { run: boolean; reason: string };

export type PatrolState = {
  /** `loop:stop` の open Issue か PR がある（チームの誰でもループを止められる） */
  stopped: boolean;
  /** open の巡回の所見（`loop:ux`）の数 */
  openFindings: number;
  /** 所見がこの数たまったら、人が読むまで巡回しない */
  maxOpenFindings: number;
  /** 前回の巡回で歩いた develop の SHA。記録が無ければ undefined */
  lastSha: string | undefined;
  changedPathsSince: (sha: string) => string[];
};

// 巡回が歩き直す価値のある変更。文書・指示・CI 設定だけの変更では歩かない。
const PATROL_PATHS =
  /^(app|features|components|contracts|lib|workers|public|messages)\//;

export const isStopped = (items: { labels: string[] }[]) =>
  items.some((i) => i.labels.includes("loop:stop"));

export function decidePatrol(s: PatrolState): Decision {
  if (s.stopped)
    return {
      run: false,
      reason: "loop:stop が付いている（チームが止めている）",
    };
  if (s.openFindings >= s.maxOpenFindings)
    return {
      run: false,
      reason: `読まれていない所見が ${s.openFindings} 件ある（上限 ${s.maxOpenFindings}）`,
    };
  if (!s.lastSha) return { run: true, reason: "巡回の記録が無い" };
  const changed = s
    .changedPathsSince(s.lastSha)
    .filter((p) => PATROL_PATHS.test(p));
  return changed.length > 0
    ? { run: true, reason: `画面・境界の変更 ${changed.length} 件` }
    : { run: false, reason: "前回の巡回から画面・境界の変更が無い" };
}

type Comment = { author: string; body: string; createdAt: string };

/** 記録 Issue のコメント（古い順）から、actor が書いた `sha:` 行のある最新の記録を読む */
export function lastLog(
  comments: Comment[],
  actor: string,
): { sha?: string; at?: string } {
  for (const c of [...comments].reverse()) {
    if (c.author !== actor) continue;
    const sha = /^sha:\s*([0-9a-f]{40})/m.exec(c.body)?.[1];
    if (sha) return { sha, at: c.createdAt };
  }
  return {};
}

// ---- GitHub から状態を集める（gh CLI を呼ぶだけで、判断は上の関数に置く） ----

const REPO = process.env.IB_LOOP_REPO || "engineer-first/idea-boost";
const ACTOR = process.env.IB_LOOP_ACTOR || "junhat6";

function gh(args: string[]): string {
  return execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  }).trim();
}
const ghJson = <T,>(args: string[]): T => JSON.parse(gh(args) || "null") as T;

type Labeled = { labels: { name: string }[] };
const labelsOf = (xs: Labeled[]) =>
  xs.map((x) => ({ labels: x.labels.map((l) => l.name) }));

function collectPatrol(): PatrolState {
  const openLabeled = (kind: "issue" | "pr", label: string) =>
    ghJson<Labeled[]>([
      kind,
      "list",
      "-R",
      REPO,
      "--state",
      "open",
      "--label",
      label,
      "-L",
      "100",
      "--json",
      "labels",
    ]);
  const stops = [
    ...openLabeled("issue", "loop:stop"),
    ...openLabeled("pr", "loop:stop"),
  ];
  const findings = openLabeled("issue", "loop:ux");
  const logIssue = ghJson<{ number: number }[]>([
    "issue",
    "list",
    "-R",
    REPO,
    "--label",
    "loop:log",
    "--state",
    "all",
    "--search",
    '"loop: patrol log" in:title',
    "-L",
    "1",
    "--json",
    "number",
  ]);
  const comments = logIssue?.length
    ? ghJson<{ author: { login: string }; body: string; createdAt: string }[]>([
        "issue",
        "view",
        String(logIssue[0].number),
        "-R",
        REPO,
        "--json",
        "comments",
        "-q",
        ".comments",
      ])
    : [];
  return {
    stopped: isStopped(labelsOf(stops)),
    openFindings: findings.length,
    maxOpenFindings: Number(process.env.IB_LOOP_MAX_OPEN_FINDINGS || 5),
    lastSha: lastLog(
      (comments ?? []).map((c) => ({
        author: c.author?.login ?? "",
        body: c.body,
        createdAt: c.createdAt,
      })),
      ACTOR,
    ).sha,
    changedPathsSince: (sha) => {
      try {
        const files = gh([
          "api",
          `repos/${REPO}/compare/${sha}...develop`,
          "-q",
          ".files[].filename",
        ])
          .split("\n")
          .filter(Boolean);
        // compare API は 300 件で切れる。切れたら「変わった」とみなす。
        return files.length >= 300 ? ["app/(truncated)"] : files;
      } catch {
        // 記録の sha を比べられない（壊れた記録など）ときは歩き直す
        return ["app/(unknown)"];
      }
    },
  };
}

const LOOPS = { patrol: () => decidePatrol(collectPatrol()) };

// automation は一時ディレクトリ（macOS では /var → /private/var の symlink の下）から起動するので、実パスで比べる。
const isMain = (() => {
  try {
    return (
      realpathSync(fileURLToPath(import.meta.url)) ===
      realpathSync(process.argv[1] ?? "")
    );
  } catch {
    return false;
  }
})();

if (isMain) {
  const loop = process.argv[2] ?? "";
  if (!Object.hasOwn(LOOPS, loop)) {
    console.error(`usage: precheck.mts <${Object.keys(LOOPS).join("|")}>`);
    process.exit(2);
  }
  try {
    const d = LOOPS[loop as keyof typeof LOOPS]();
    console.log(`${d.run ? "run" : "skip"}: ${d.reason}`);
    process.exit(d.run ? 0 : 1);
  } catch (e) {
    // 状態を読めないときは起こさない（分からない＝起こさない）。exit 3 で skip の理由と区別する。
    console.log(
      `skip: 状態を読めなかった (${(e as Error).message.split("\n")[0]})`,
    );
    process.exit(3);
  }
}
