// Orca automation の precheck。exit 0 のときだけ agent を起こし、やることが無い周回の起動と課金を避ける。
// 条件の正本は docs/loop/README.md。ここは判定と、GitHub から状態を集める処理だけを持つ。
// 使い方: node scripts/loop/precheck.mts <build|polish|patrol|mend|release|replan>
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

type Labels = { labels: string[] };

/** build が拾ってよい Issue：`loop:ready` があり、着手中・詰まり・除外が無く、担当者がオーナーか未設定 */
export function isReady(
  i: Labels & { assignees: string[] },
  actor: string,
): boolean {
  if (!i.labels.includes("loop:ready")) return false;
  if (
    ["claimed", "blocked", "needs-human", "loop:skip"].some((l) =>
      i.labels.includes(l),
    )
  )
    return false;
  return i.assignees.every((a) => a === actor);
}

type Run = { status: string; conclusion: string };

/** 新しい順の run から、完了した最新の結果が失敗かを返す（実行中は飛ばす） */
export function latestConclusionFailed(runs: Run[]): boolean {
  const done = runs.find((r) => r.status === "completed");
  return done ? ["failure", "timed_out"].includes(done.conclusion) : false;
}

const STOPPED: Decision = {
  run: false,
  reason: "loop:stop が付いている（チームが止めている）",
};
const RED: Decision = {
  run: false,
  reason: "develop の CI が赤（先に mend が直す）",
};

// gh CLI が返す Renovate（GitHub App）の author.login。
const RENOVATE = "app/renovate";
const STALLED_AFTER_MS = 3_600_000;

/**
 * ループが流す PR（ループのアカウントの `loop` PR と、Renovate の `dependencies` PR）が1時間動いていない。
 * 通る PR は周回の中か auto-merge でマージされるので、open のまま動かない PR は誰も進めていない。
 */
export function isStalledPr(
  pr: Labels & { author: string; updatedAt: string },
  actor: string,
  now: number,
): boolean {
  if (
    ["needs-human", "blocked", "loop:skip"].some((l) => pr.labels.includes(l))
  )
    return false;
  const carried =
    (pr.labels.includes("loop") && pr.author === actor) ||
    (pr.labels.includes("dependencies") && pr.author === RENOVATE);
  return carried && now - Date.parse(pr.updatedAt) >= STALLED_AFTER_MS;
}

export type BuildState = {
  stopped: boolean;
  developRed: boolean;
  openLoopPrs: number;
  maxOpenLoopPrs: number;
  ready: number;
  /** 止まっている PR（isStalledPr）の数。新しい Issue より先に流す */
  stalledPrs: number;
};

export function decideBuild(s: BuildState): Decision {
  if (s.stopped) return STOPPED;
  if (s.developRed) return RED;
  // 上限より先に見る。止まった PR が上限を埋めると、流す周回まで起きなくなるため。
  if (s.stalledPrs > 0)
    return {
      run: true,
      reason: `止まっている PR が ${s.stalledPrs} 本（先に流す）`,
    };
  if (s.openLoopPrs >= s.maxOpenLoopPrs)
    return {
      run: false,
      reason: `ループの open PR が ${s.openLoopPrs} 本（上限 ${s.maxOpenLoopPrs}）`,
    };
  return s.ready > 0
    ? { run: true, reason: `拾える loop:ready が ${s.ready} 件` }
    : { run: false, reason: "拾える loop:ready が無い" };
}

export type PolishState = Omit<BuildState, "ready" | "stalledPrs"> & {
  lastAt: string | undefined;
  now: number;
};

const POLISH_INTERVAL_MS = 2 * 3_600_000;

export function decidePolish(s: PolishState): Decision {
  if (s.stopped) return STOPPED;
  if (s.developRed) return RED;
  if (s.openLoopPrs >= s.maxOpenLoopPrs)
    return {
      run: false,
      reason: `ループの open PR が ${s.openLoopPrs} 本（上限 ${s.maxOpenLoopPrs}）`,
    };
  if (s.lastAt && s.now - Date.parse(s.lastAt) < POLISH_INTERVAL_MS)
    return { run: false, reason: "前回の polish から2時間たっていない" };
  return { run: true, reason: "前回の polish から2時間以上たった" };
}

export function decideMend(s: {
  stopped: boolean;
  developRed: boolean;
}): Decision {
  if (s.stopped) return STOPPED;
  return s.developRed
    ? { run: true, reason: "develop の CI が赤" }
    : { run: false, reason: "develop の CI は赤ではない" };
}

export type ReleaseState = {
  stopped: boolean;
  p0Open: number;
  developRed: boolean;
  /** release（本番の写し）に対して develop が進んでいる commit 数 */
  aheadBy: number;
  /** Promote Release か Deploy が実行中・待機中 */
  releaseRunActive: boolean;
};

export function decideRelease(s: ReleaseState): Decision {
  if (s.stopped) return STOPPED;
  if (s.p0Open > 0)
    return {
      run: false,
      reason: `open な P0 が ${s.p0Open} 件（列車を止める）`,
    };
  if (s.developRed) return RED;
  if (s.releaseRunActive)
    return { run: false, reason: "Promote / Deploy が実行中" };
  return s.aheadBy > 0
    ? {
        run: true,
        reason: `本番より develop が ${s.aheadBy} commit 進んでいる`,
      }
    : { run: false, reason: "本番と develop に差が無い" };
}

export function decideReplan(s: {
  stopped: boolean;
  ready: number;
  blocked: number;
}): Decision {
  if (s.stopped) return STOPPED;
  if (s.ready < 3)
    return { run: true, reason: `拾える loop:ready が ${s.ready} 件` };
  if (s.blocked >= 3)
    return { run: true, reason: `blocked が ${s.blocked} 件` };
  return { run: false, reason: "待ち行列は足りている" };
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

const stopped = () =>
  isStopped(
    labelsOf([
      ...openLabeled("issue", "loop:stop"),
      ...openLabeled("pr", "loop:stop"),
    ]),
  );

/** develop への push の CI と Browser のどちらかの、完了した最新の run が失敗 */
function developRed(): boolean {
  return ["ci.yml", "browser.yml"].some((wf) =>
    latestConclusionFailed(
      ghJson<Run[]>([
        "run",
        "list",
        "-R",
        REPO,
        "--workflow",
        wf,
        "--branch",
        "develop",
        "--event",
        "push",
        "-L",
        "5",
        "--json",
        "status,conclusion",
      ]) ?? [],
    ),
  );
}

const openLoopPrs = () =>
  (
    ghJson<{ number: number }[]>([
      "pr",
      "list",
      "-R",
      REPO,
      "--state",
      "open",
      "--label",
      "loop",
      "-L",
      "100",
      "--json",
      "number",
    ]) ?? []
  ).length;

const stalledPrs = () =>
  (
    ghJson<(Labeled & { author: { login: string }; updatedAt: string })[]>([
      "pr",
      "list",
      "-R",
      REPO,
      "--state",
      "open",
      "-L",
      "100",
      "--json",
      "labels,author,updatedAt",
    ]) ?? []
  ).filter((pr) =>
    isStalledPr(
      {
        labels: pr.labels.map((l) => l.name),
        author: pr.author?.login ?? "",
        updatedAt: pr.updatedAt,
      },
      ACTOR,
      Date.now(),
    ),
  ).length;

function loopIssues() {
  const xs =
    ghJson<{ labels: { name: string }[]; assignees: { login: string }[] }[]>([
      "issue",
      "list",
      "-R",
      REPO,
      "--state",
      "open",
      "--label",
      "loop:ready",
      "-L",
      "200",
      "--json",
      "labels,assignees",
    ]) ?? [];
  const issues = xs.map((x) => ({
    labels: x.labels.map((l) => l.name),
    assignees: x.assignees.map((a) => a.login),
  }));
  return {
    ready: issues.filter((i) => isReady(i, ACTOR)).length,
    blocked: issues.filter((i) => i.labels.includes("blocked")).length,
  };
}

function logComments(title: string): Comment[] {
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
    `"${title}" in:title`,
    "-L",
    "1",
    "--json",
    "number",
  ]);
  if (!logIssue?.length) return [];
  const comments =
    ghJson<{ author: { login: string }; body: string; createdAt: string }[]>([
      "issue",
      "view",
      String(logIssue[0].number),
      "-R",
      REPO,
      "--json",
      "comments",
      "-q",
      ".comments",
    ]) ?? [];
  return comments.map((c) => ({
    author: c.author?.login ?? "",
    body: c.body,
    createdAt: c.createdAt,
  }));
}

function collectPatrol(): PatrolState {
  const findings = openLabeled("issue", "loop:ux");
  return {
    stopped: stopped(),
    openFindings: findings.length,
    maxOpenFindings: Number(process.env.IB_LOOP_MAX_OPEN_FINDINGS || 8),
    lastSha: lastLog(logComments("loop: patrol log"), ACTOR).sha,
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

const MAX_OPEN_LOOP_PRS = Number(process.env.IB_LOOP_MAX_OPEN_PRS || 2);

function collectRelease(): ReleaseState {
  const active = ["promote-release.yml", "deploy.yml"].some((wf) =>
    (
      ghJson<Run[]>([
        "run",
        "list",
        "-R",
        REPO,
        "--workflow",
        wf,
        "-L",
        "3",
        "--json",
        "status,conclusion",
      ]) ?? []
    ).some((r) => r.status !== "completed"),
  );
  return {
    stopped: stopped(),
    p0Open: openLabeled("issue", "P0").length,
    developRed: developRed(),
    aheadBy: Number(
      gh([
        "api",
        `repos/${REPO}/compare/release...develop`,
        "-q",
        ".ahead_by",
      ]) || 0,
    ),
    releaseRunActive: active,
  };
}

const LOOPS = {
  patrol: () => decidePatrol(collectPatrol()),
  build: () =>
    decideBuild({
      stopped: stopped(),
      developRed: developRed(),
      openLoopPrs: openLoopPrs(),
      maxOpenLoopPrs: MAX_OPEN_LOOP_PRS,
      ready: loopIssues().ready,
      stalledPrs: stalledPrs(),
    }),
  polish: () =>
    decidePolish({
      stopped: stopped(),
      developRed: developRed(),
      openLoopPrs: openLoopPrs(),
      maxOpenLoopPrs: MAX_OPEN_LOOP_PRS,
      lastAt: lastLog(logComments("loop: polish log"), ACTOR).at,
      now: Date.now(),
    }),
  mend: () => decideMend({ stopped: stopped(), developRed: developRed() }),
  release: () => decideRelease(collectRelease()),
  replan: () => decideReplan({ stopped: stopped(), ...loopIssues() }),
};

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
