// Orca automation の precheck。exit 0 のときだけ agent を起こし、やることが無い周回の起動と課金を避ける。
// ループ名と条件の正本は docs/loop/LOOPS.md。ここは判定（decide）と、GitHub から状態を集める処理（collect）だけを持つ。
// 使い方: node scripts/loop/precheck.mts <loop>
//   automation からは origin/develop の precheck.mts と risk.mts を一時ディレクトリへ書き出して実行する。
//   import してよいのは同じディレクトリの risk.mts だけ。
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Risk, riskOf } from "./risk.mts";

export type LoopName =
  | "mend"
  | "finish"
  | "land"
  | "patrol"
  | "garden"
  | "replan";

export type Health = "success" | "failure" | "pending";

export type LoopIssue = {
  number: number;
  labels: string[];
  assignees: string[];
  updatedAt: string;
};

export type LoopPr = {
  number: number;
  isDraft: boolean;
  labels: string[];
  author: string;
  checks: Health;
  files: string[];
  headSha: string;
  autoMerge: boolean;
  /** land が前回この PR を見たときの head。印が無ければ undefined */
  landedHead: string | undefined;
  /** land の印より後に、ほかの人やレビューの動きがあったか */
  activityAfterLand: boolean;
};

export type LoopLog = { sha?: string; at?: string };

export type LoopState = {
  now: number;
  /** ループが動く GitHub アカウント。ループの PR と記録はこの作者のものだけを読む */
  actor: string;
  /** `loop:stop` の open Issue がある（チームの誰でも全ループを止められる） */
  stopped: boolean;
  developHead: string;
  developHealth: Health;
  issues: LoopIssue[];
  prs: LoopPr[];
  mergedLoopPrs24h: number;
  logs: Partial<Record<LoopName, LoopLog>>;
  changedPathsSince: (sha: string) => string[];
  maxOpenLoopPrs: number;
  maxDailyMerges: number;
  /** land がマージを判定してよい最も高い段階（段階的に上げる） */
  landMaxRisk: Risk;
};

export type Decision = { run: boolean; reason: string };

const QUEUE_LABELS = ["loop:finish", "loop:ux", "loop:garden"];
const HOLD_LABELS = [
  "loop:claimed",
  "loop:blocked",
  "loop:reverted",
  "needs-human",
];
const RENOVATE = "app/renovate";
const STALE_CLAIM_MS = 3 * 3_600_000;
const RISKS: Risk[] = ["R0", "R1", "R2"];
// 巡回が歩き直す価値のある変更。文書・指示・CI 設定だけの変更では歩かない。
const PATROL_PATHS =
  /^(app|features|components|contracts|lib|workers|public|messages)\//;

const has = (p: { labels: string[] }, l: string) => p.labels.includes(l);
const isLoopPr = (s: LoopState, p: LoopPr) =>
  p.author === s.actor && p.labels.some((l) => l.startsWith("loop:"));
const isWorkPr = (s: LoopState, p: LoopPr) =>
  isLoopPr(s, p) &&
  p.labels.some((l) => QUEUE_LABELS.includes(l)) &&
  !has(p, "needs-human");

export const pickable = (issues: LoopIssue[]) =>
  issues.filter(
    (i) =>
      i.assignees.length === 0 &&
      i.labels.some((l) => QUEUE_LABELS.includes(l)) &&
      !i.labels.some((l) => HOLD_LABELS.includes(l)),
  );

const yes = (reason: string): Decision => ({ run: true, reason });
const no = (reason: string): Decision => ({ run: false, reason });

function landable(s: LoopState, p: LoopPr): boolean {
  const renovate = p.author === RENOVATE;
  if (!renovate && !isLoopPr(s, p)) return false;
  if (p.isDraft || p.checks === "pending" || p.autoMerge) return false;
  if (has(p, "needs-human") || has(p, "loop:fix")) return false;
  if (p.landedHead === p.headSha && !p.activityAfterLand) return false;
  if (s.developHealth === "failure" && !has(p, "loop:mend")) return false;
  // Renovate の段階は依存の種類で決める（land.md）。ループの PR は変更ファイルで決める。
  if (
    !renovate &&
    RISKS.indexOf(riskOf(p.files)) > RISKS.indexOf(s.landMaxRisk)
  )
    return false;
  return true;
}

export function decide(loop: LoopName, s: LoopState): Decision {
  if (s.stopped) return no("loop:stop の Issue が open（チームが止めている）");
  switch (loop) {
    case "mend": {
      if (s.developHealth !== "failure") return no("develop は赤くない");
      if (s.prs.some((p) => has(p, "loop:mend")))
        return no("修理の PR がすでに開いている");
      return yes("develop の CI が失敗している");
    }
    case "finish": {
      if (s.developHealth === "failure")
        return no("develop が赤い（mend が先）");
      const fix = s.prs.filter(
        (p) => isLoopPr(s, p) && has(p, "loop:fix") && !has(p, "needs-human"),
      );
      if (fix.length > 0)
        return yes(
          `差し戻された PR: ${fix.map((p) => `#${p.number}`).join(" ")}`,
        );
      const open = s.prs.filter((p) => isWorkPr(s, p)).length;
      if (open >= s.maxOpenLoopPrs)
        return no(
          `作業中のループの PR が上限 ${s.maxOpenLoopPrs} 本に達している`,
        );
      const n = pickable(s.issues).length;
      return n > 0 ? yes(`拾える Issue が ${n} 件`) : no("拾える Issue が無い");
    }
    case "land": {
      if (s.mergedLoopPrs24h >= s.maxDailyMerges)
        return no(`24時間のマージが上限 ${s.maxDailyMerges} 本に達している`);
      const ready = s.prs.filter((p) => landable(s, p));
      return ready.length > 0
        ? yes(`判定できる PR: ${ready.map((p) => `#${p.number}`).join(" ")}`)
        : no("判定できる PR が無い");
    }
    case "patrol": {
      const sha = s.logs.patrol?.sha;
      if (!sha) return yes("巡回の記録が無い");
      const changed = s
        .changedPathsSince(sha)
        .filter((p) => PATROL_PATHS.test(p));
      return changed.length > 0
        ? yes(`画面・境界の変更 ${changed.length} 件`)
        : no("前回の巡回から画面・境界の変更が無い");
    }
    case "garden": {
      const sha = s.logs.garden?.sha;
      if (!sha) return yes("庭仕事の記録が無い");
      return sha === s.developHead
        ? no("前回から develop が進んでいない")
        : yes("develop が進んだ");
    }
    case "replan": {
      const at = s.logs.replan?.at;
      if (!at) return yes("再計画の記録が無い");
      if (pickable(s.issues).length === 0) return yes("拾える Issue が無い");
      const loopIssues = s.issues.filter((i) =>
        i.labels.some((l) => l.startsWith("loop:")),
      );
      const blocked = loopIssues.filter((i) => has(i, "loop:blocked"));
      if (blocked.length >= 3) return yes(`行き詰まりが ${blocked.length} 件`);
      const stale = loopIssues.filter(
        (i) =>
          has(i, "loop:claimed") &&
          s.now - Date.parse(i.updatedAt) > STALE_CLAIM_MS,
      );
      if (stale.length > 0)
        return yes(
          `3時間動きの無い着手: ${stale.map((i) => `#${i.number}`).join(" ")}`,
        );
      const since = Date.parse(at);
      return loopIssues.some((i) => Date.parse(i.updatedAt) > since)
        ? yes("前回の再計画以降にループの Issue が動いた")
        : no("前回の再計画以降に動きが無い");
    }
  }
}

// ---- 純粋な読み取り関数（GitHub の応答 → 判定の材料） ----

export type Rollup = {
  name?: string;
  context?: string;
  workflowName?: string;
  startedAt?: string;
  status?: string;
  conclusion?: string;
  state?: string;
};

const BAD = [
  "FAILURE",
  "ERROR",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
];

/** 同じ検査が再実行・置き換えで複数あるときは、最後に始まったものだけで判定する */
export function rollupHealth(rollup: Rollup[]): Health {
  const latest = new Map<string, Rollup>();
  for (const r of rollup) {
    const key = `${r.workflowName ?? ""}/${r.name ?? r.context ?? ""}`;
    const prev = latest.get(key);
    if (!prev || (r.startedAt ?? "") >= (prev.startedAt ?? ""))
      latest.set(key, r);
  }
  const checks = [...latest.values()];
  const done = (r: Rollup) =>
    r.status ? r.status === "COMPLETED" : r.state !== "PENDING";
  if (
    checks.some((r) => done(r) && BAD.includes(r.conclusion ?? r.state ?? ""))
  )
    return "failure";
  if (checks.some((r) => !done(r))) return "pending";
  return "success";
}

type Run = { status: string; conclusion: string };

/** workflow ごとの run（新しい順）から develop の健康を決める。取り消し・skip は飛ばす */
export function healthFromRuns(perWorkflow: Run[][]): Health {
  let pending = false;
  for (const runs of perWorkflow) {
    if (runs[0] && runs[0].status !== "completed") pending = true;
    const last = runs.find(
      (r) =>
        r.status === "completed" &&
        !["cancelled", "skipped"].includes(r.conclusion),
    );
    if (last && last.conclusion !== "success") return "failure";
  }
  return pending ? "pending" : "success";
}

type Comment = { author: string; body: string; createdAt: string };

/** 記録 Issue のコメント（古い順）から、actor が書いた最新の記録を読む */
export function lastLog(
  comments: Comment[],
  actor: string,
  needSha: boolean,
): LoopLog {
  for (const c of [...comments].reverse()) {
    if (c.author !== actor) continue;
    const sha = /^sha:\s*([0-9a-f]{40})/m.exec(c.body)?.[1];
    if (needSha && !sha) continue;
    return { sha, at: c.createdAt };
  }
  return {};
}

/** PR のコメント・レビュー（古い順）から、land の印とその後の動きを読む */
export function landMark(
  comments: Comment[],
  reviews: { author: string; submittedAt: string }[],
  actor: string,
): { landedHead: string | undefined; activityAfterLand: boolean } {
  const mark = [...comments]
    .reverse()
    .find(
      (c) =>
        c.author === actor &&
        /<!-- loop:land head=[0-9a-f]{40} -->/.test(c.body),
    );
  if (!mark) return { landedHead: undefined, activityAfterLand: false };
  const landedHead = /head=([0-9a-f]{40})/.exec(mark.body)?.[1];
  const after = (t: string) => t > mark.createdAt;
  const activityAfterLand =
    comments.some((c) => c !== mark && after(c.createdAt)) ||
    reviews.some((r) => after(r.submittedAt));
  return { landedHead, activityAfterLand };
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

type RawComment = {
  author: { login: string };
  body: string;
  createdAt: string;
};
const toComment = (c: RawComment): Comment => ({
  author: c.author?.login ?? "",
  body: c.body,
  createdAt: c.createdAt,
});

function readLog(loop: LoopName): LoopLog {
  const found = ghJson<{ number: number }[]>([
    "issue",
    "list",
    "-R",
    REPO,
    "--label",
    "loop:log",
    "--state",
    "all",
    "--search",
    `"loop: ${loop} log" in:title`,
    "-L",
    "1",
    "--json",
    "number",
  ]);
  if (!found?.length) return {};
  const comments = ghJson<RawComment[]>([
    "issue",
    "view",
    String(found[0].number),
    "-R",
    REPO,
    "--json",
    "comments",
    "-q",
    ".comments",
  ]);
  return lastLog((comments ?? []).map(toComment), ACTOR, loop !== "replan");
}

function collect(): LoopState {
  type RawIssue = {
    number: number;
    labels: { name: string }[];
    assignees: { login: string }[];
    updatedAt: string;
  };
  type RawPr = {
    number: number;
    isDraft: boolean;
    labels: { name: string }[];
    author: { login: string };
    statusCheckRollup: Rollup[];
    files: { path: string }[];
    headRefOid: string;
    autoMergeRequest: unknown;
    comments: RawComment[];
    reviews: { author: { login: string }; submittedAt: string }[];
  };
  const issues = ghJson<RawIssue[]>([
    "issue",
    "list",
    "-R",
    REPO,
    "--state",
    "open",
    "-L",
    "500",
    "--json",
    "number,labels,assignees,updatedAt",
  ]);
  const prs = ghJson<RawPr[]>([
    "pr",
    "list",
    "-R",
    REPO,
    "--state",
    "open",
    "-L",
    "100",
    "--json",
    "number,isDraft,labels,author,statusCheckRollup,files,headRefOid,autoMergeRequest,comments,reviews",
  ]);
  const runs = ["ci.yml", "browser.yml"].map((wf) =>
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
      "10",
      "--json",
      "status,conclusion",
    ]),
  );
  const since = new Date(Date.now() - 86_400_000).toISOString().slice(0, 19);
  const merged = ghJson<unknown[]>([
    "pr",
    "list",
    "-R",
    REPO,
    "--state",
    "merged",
    "-L",
    "100",
    "--search",
    `author:${ACTOR} label:loop:finish,loop:ux,loop:garden,loop:mend merged:>${since}`,
    "--json",
    "number",
  ]);
  return {
    now: Date.now(),
    actor: ACTOR,
    stopped: issues.some((i) => i.labels.some((l) => l.name === "loop:stop")),
    developHead: gh(["api", `repos/${REPO}/commits/develop`, "-q", ".sha"]),
    developHealth: healthFromRuns(runs),
    issues: issues.map((i) => ({
      number: i.number,
      labels: i.labels.map((l) => l.name),
      assignees: i.assignees.map((a) => a.login),
      updatedAt: i.updatedAt,
    })),
    prs: prs.map((p) => ({
      number: p.number,
      isDraft: p.isDraft,
      labels: p.labels.map((l) => l.name),
      author: p.author.login,
      checks: rollupHealth(p.statusCheckRollup ?? []),
      files: (p.files ?? []).map((f) => f.path),
      headSha: p.headRefOid,
      autoMerge: p.autoMergeRequest != null,
      ...landMark(
        (p.comments ?? []).map(toComment),
        (p.reviews ?? []).map((r) => ({
          author: r.author?.login ?? "",
          submittedAt: r.submittedAt,
        })),
        ACTOR,
      ),
    })),
    mergedLoopPrs24h: merged.length,
    logs: {
      patrol: readLog("patrol"),
      garden: readLog("garden"),
      replan: readLog("replan"),
    },
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
    maxOpenLoopPrs: Number(process.env.IB_LOOP_MAX_OPEN_PRS || 2),
    maxDailyMerges: Number(process.env.IB_LOOP_MAX_DAILY_MERGES || 6),
    landMaxRisk: (process.env.IB_LOOP_LAND_MAX_RISK as Risk) || "R0",
  };
}

const LOOPS: LoopName[] = [
  "mend",
  "finish",
  "land",
  "patrol",
  "garden",
  "replan",
];

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
  const loop = process.argv[2] as LoopName;
  if (!LOOPS.includes(loop)) {
    console.error(`usage: precheck.mts <${LOOPS.join("|")}>`);
    process.exit(2);
  }
  try {
    const d = decide(loop, collect());
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
