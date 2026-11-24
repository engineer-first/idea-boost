// Orca automation の precheck。exit 0 のときだけ agent を起こし、やることが無い周回の起動と課金を避ける。
// ループ名と条件は docs/loop/LOOPS.md に揃える。
//   mend   … develop の最新 CI / Browser が失敗し、修理の PR がまだ無い
//   finish … develop が赤くなく、loop の開いた PR が上限未満で、拾える loop Issue がある
//   land   … 検査を終えた loop の PR か Renovate の PR がある（人の判断待ちは除く）
//   patrol … 前回の巡回から画面・境界のコードが変わった
//   garden … 前回の庭仕事から develop が進んだ
//   replan … 拾える Issue が無い、行き詰まりが3件以上、または前回から Issue が動いた
// 使い方: node scripts/loop/precheck.mts <loop>
//   automation からは origin/develop の版を一時ファイルへ書き出して実行する（このファイルは他を import しない）。
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
};

export type LoopLog = { sha?: string; at?: string };

export type LoopState = {
  now: number;
  developHead: string;
  developHealth: Health;
  issues: LoopIssue[];
  prs: LoopPr[];
  logs: Partial<Record<LoopName, LoopLog>>;
  changedPathsSince: (sha: string) => string[];
  maxOpenLoopPrs: number;
};

export type Decision = { run: boolean; reason: string };

const QUEUE_LABELS = ["loop:finish", "loop:ux", "loop:garden"];
const HOLD_LABELS = ["loop:claimed", "loop:blocked", "needs-human"];
const RENOVATE = "app/renovate";
// 巡回が歩き直す価値のある変更。文書・指示・CI 設定だけの変更では歩かない。
const PATROL_PATHS =
  /^(app|features|components|contracts|lib|workers|public)\//;

const isLoopPr = (p: LoopPr) => p.labels.some((l) => l.startsWith("loop:"));

export const pickable = (issues: LoopIssue[]) =>
  issues.filter(
    (i) =>
      i.assignees.length === 0 &&
      i.labels.some((l) => QUEUE_LABELS.includes(l)) &&
      !i.labels.some((l) => HOLD_LABELS.includes(l)),
  );

const yes = (reason: string): Decision => ({ run: true, reason });
const no = (reason: string): Decision => ({ run: false, reason });

export function decide(loop: LoopName, s: LoopState): Decision {
  switch (loop) {
    case "mend": {
      if (s.developHealth !== "failure") return no("develop は赤くない");
      if (s.prs.some((p) => p.labels.includes("loop:mend")))
        return no("修理の PR がすでに開いている");
      return yes("develop の CI が失敗している");
    }
    case "finish": {
      if (s.developHealth === "failure")
        return no("develop が赤い（mend が先）");
      const open = s.prs.filter(isLoopPr).length;
      if (open >= s.maxOpenLoopPrs)
        return no(`loop の開いた PR が上限 ${s.maxOpenLoopPrs} 件に達している`);
      const n = pickable(s.issues).length;
      return n > 0 ? yes(`拾える Issue が ${n} 件`) : no("拾える Issue が無い");
    }
    case "land": {
      const ready = s.prs.filter(
        (p) =>
          (isLoopPr(p) || p.author === RENOVATE) &&
          !p.isDraft &&
          p.checks !== "pending" &&
          !p.labels.includes("needs-human"),
      );
      return ready.length > 0
        ? yes(`検査を終えた PR: ${ready.map((p) => `#${p.number}`).join(" ")}`)
        : no("取り込める PR が無い");
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
      const blocked = s.issues.filter((i) => i.labels.includes("loop:blocked"));
      if (blocked.length >= 3) return yes(`行き詰まりが ${blocked.length} 件`);
      const since = Date.parse(at);
      return s.issues.some((i) => Date.parse(i.updatedAt) > since)
        ? yes("前回の再計画以降に Issue が動いた")
        : no("前回の再計画以降に動きが無い");
    }
  }
}

// ---- GitHub から状態を集める（ここから下は gh CLI を呼ぶだけで、判断は decide に置く） ----

const REPO = process.env.IB_LOOP_REPO || "engineer-first/idea-boost";

function gh(args: string[]): string {
  return execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  }).trim();
}
const ghJson = <T,>(args: string[]): T => JSON.parse(gh(args) || "null") as T;

type Rollup = { status?: string; conclusion?: string; state?: string };

export function rollupHealth(rollup: Rollup[]): Health {
  const done = (r: Rollup) =>
    r.status ? r.status === "COMPLETED" : r.state !== "PENDING";
  const bad = (r: Rollup) =>
    ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(
      r.conclusion ?? r.state ?? "",
    );
  if (rollup.some((r) => done(r) && bad(r))) return "failure";
  if (rollup.some((r) => !done(r))) return "pending";
  return "success";
}

function developHealth(): Health {
  const runs = ["ci.yml", "browser.yml"].map(
    (wf) =>
      ghJson<{ status: string; conclusion: string }[]>([
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
        "1",
        "--json",
        "status,conclusion",
      ])[0],
  );
  return rollupHealth(
    runs.filter(Boolean).map((r) => ({
      status: r.status.toUpperCase(),
      conclusion: r.conclusion.toUpperCase(),
    })),
  );
}

function lastLog(loop: LoopName): LoopLog {
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
  const comments = ghJson<{ body: string; createdAt: string }[]>([
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
  const last = comments?.at(-1);
  if (!last) return {};
  const sha = /^sha:\s*([0-9a-f]{40})/m.exec(last.body)?.[1];
  return { sha, at: last.createdAt };
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
  ]).map((i) => ({
    number: i.number,
    labels: i.labels.map((l) => l.name),
    assignees: i.assignees.map((a) => a.login),
    updatedAt: i.updatedAt,
  }));
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
    "number,isDraft,labels,author,statusCheckRollup",
  ]).map((p) => ({
    number: p.number,
    isDraft: p.isDraft,
    labels: p.labels.map((l) => l.name),
    author: p.author.login,
    checks: rollupHealth(p.statusCheckRollup ?? []),
  }));
  return {
    now: Date.now(),
    developHead: gh(["api", `repos/${REPO}/commits/develop`, "-q", ".sha"]),
    developHealth: developHealth(),
    issues,
    prs,
    logs: {
      patrol: lastLog("patrol"),
      garden: lastLog("garden"),
      replan: lastLog("replan"),
    },
    changedPathsSince: (sha) => {
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
    },
    maxOpenLoopPrs: Number(process.env.IB_LOOP_MAX_OPEN_PRS || 2),
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

// automation は一時ファイル（macOS では /var → /private/var の symlink の下）から起動するので、実パスで比べる。
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
    // 状態を読めないときは起こさない（分からない＝起こさない）。理由は run 履歴に残す。
    console.log(
      `skip: 状態を読めなかった (${(e as Error).message.split("\n")[0]})`,
    );
    process.exit(1);
  }
}
