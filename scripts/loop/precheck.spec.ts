// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decide,
  healthFromRuns,
  type LoopIssue,
  type LoopPr,
  type LoopState,
  landMark,
  lastLog,
  rollupHealth,
} from "./precheck.mts";

const NOW = Date.parse("2026-11-24T12:00:00+09:00");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const ACTOR = "loop-bot";

const issue = (over: Partial<LoopIssue> = {}): LoopIssue => ({
  number: 1,
  labels: ["loop:finish"],
  assignees: [],
  updatedAt: hoursAgo(10),
  ...over,
});

const pr = (over: Partial<LoopPr> = {}): LoopPr => ({
  number: 10,
  isDraft: false,
  labels: ["loop:finish"],
  author: ACTOR,
  checks: "success",
  files: ["docs/prd.md"],
  headSha: "c".repeat(40),
  autoMerge: false,
  landedHead: undefined,
  activityAfterLand: false,
  ...over,
});

const state = (over: Partial<LoopState> = {}): LoopState => ({
  now: NOW,
  actor: ACTOR,
  stopped: false,
  developHead: "b".repeat(40),
  developHealth: "success",
  issues: [],
  prs: [],
  mergedLoopPrs24h: 0,
  logs: {},
  changedPathsSince: () => [],
  maxOpenLoopPrs: 2,
  maxDailyMerges: 6,
  landMaxRisk: "R0",
  ...over,
});

describe("停止: loop:stop の open Issue があれば全ループを起こさない", () => {
  it("どのループも skip する", () => {
    const s = state({
      stopped: true,
      developHealth: "failure",
      issues: [issue()],
      prs: [pr()],
    });
    for (const loop of [
      "mend",
      "finish",
      "land",
      "patrol",
      "garden",
      "replan",
    ] as const) {
      expect(decide(loop, s).run, loop).toBe(false);
    }
  });
});

describe("decide(mend): develop が赤いときだけ修理を起こす", () => {
  it("develop の CI が失敗していれば起こす", () => {
    expect(decide("mend", state({ developHealth: "failure" })).run).toBe(true);
  });

  it("green・実行中なら起こさない", () => {
    expect(decide("mend", state({ developHealth: "success" })).run).toBe(false);
    expect(decide("mend", state({ developHealth: "pending" })).run).toBe(false);
  });

  it("修理の PR がすでに開いていれば重ねて起こさない", () => {
    const s = state({
      developHealth: "failure",
      prs: [pr({ labels: ["loop:mend"] })],
    });
    expect(decide("mend", s).run).toBe(false);
  });
});

describe("decide(finish): 直す PR か拾える Issue があり、枠が空いているとき起こす", () => {
  it("未着手・担当者なしの loop Issue があれば起こす", () => {
    expect(decide("finish", state({ issues: [issue()] })).run).toBe(true);
  });

  it("担当者付き・着手中・行き詰まり・人の判断待ち・revert 済みの Issue は拾わない", () => {
    expect(
      decide("finish", state({ issues: [issue({ assignees: ["mame77"] })] }))
        .run,
    ).toBe(false);
    for (const label of [
      "loop:claimed",
      "loop:blocked",
      "needs-human",
      "loop:reverted",
    ]) {
      const s = state({ issues: [issue({ labels: ["loop:ux", label] })] });
      expect(decide("finish", s).run, label).toBe(false);
    }
  });

  it("loop ラベルの無い Issue は拾わない", () => {
    const s = state({ issues: [issue({ labels: ["task"] })] });
    expect(decide("finish", s).run).toBe(false);
  });

  it("作業中の finish の PR が上限に達していれば新しく拾わない", () => {
    const s = state({
      issues: [issue()],
      prs: [pr({ number: 1 }), pr({ number: 2, labels: ["loop:ux"] })],
    });
    expect(decide("finish", s).run).toBe(false);
  });

  it("人の判断待ち・修理・人の PR は枠に数えない", () => {
    const s = state({
      issues: [issue()],
      prs: [
        pr({ number: 1, labels: ["loop:finish", "needs-human"] }),
        pr({ number: 2, labels: ["loop:mend"] }),
        pr({ number: 3, author: "mame77", labels: ["loop:finish"] }),
      ],
    });
    expect(decide("finish", s).run).toBe(true);
  });

  it("land が差し戻した PR（loop:fix）があれば、枠が埋まっていても直しに起こす", () => {
    const s = state({
      prs: [
        pr({ number: 1, labels: ["loop:finish", "loop:fix"] }),
        pr({ number: 2 }),
      ],
    });
    expect(decide("finish", s).run).toBe(true);
  });

  it("develop が赤い間は新しい仕事を始めない", () => {
    const s = state({ issues: [issue()], developHealth: "failure" });
    expect(decide("finish", s).run).toBe(false);
  });
});

describe("decide(land): マージを判定できる PR があるとき取り込みを起こす", () => {
  it("検査を終えた R0 のループ PR があれば起こす", () => {
    expect(decide("land", state({ prs: [pr()] })).run).toBe(true);
  });

  it("Draft・検査中・人の判断待ち・差し戻し中・auto-merge 待ちの PR では起こさない", () => {
    const s = state({
      prs: [
        pr({ isDraft: true }),
        pr({ number: 11, checks: "pending" }),
        pr({ number: 12, labels: ["loop:finish", "needs-human"] }),
        pr({ number: 13, labels: ["loop:finish", "loop:fix"] }),
        pr({ number: 14, autoMerge: true }),
      ],
    });
    expect(decide("land", s).run).toBe(false);
  });

  it("変更ファイルの段階が上限を超える PR は扱わない（自己申告ではなくパスで決める）", () => {
    const s = state({ prs: [pr({ files: ["features/room/ui/board.tsx"] })] });
    expect(decide("land", s).run).toBe(false);
    expect(decide("land", { ...s, landMaxRisk: "R1" }).run).toBe(true);
    const r2 = state({
      landMaxRisk: "R1",
      prs: [pr({ files: ["workers/room/room-do.ts"] })],
    });
    expect(decide("land", r2).run).toBe(false);
  });

  it("前回見た head から動きの無い PR では起こさない", () => {
    const head = "c".repeat(40);
    const seen = state({ prs: [pr({ landedHead: head })] });
    expect(decide("land", seen).run).toBe(false);
    const moved = state({
      prs: [pr({ landedHead: head, activityAfterLand: true })],
    });
    expect(decide("land", moved).run).toBe(true);
    const pushed = state({ prs: [pr({ landedHead: "d".repeat(40) })] });
    expect(decide("land", pushed).run).toBe(true);
  });

  it("Renovate の PR は対象にし、ループ以外の作者の PR は loop ラベルがあっても対象にしない", () => {
    const renovate = pr({
      author: "app/renovate",
      labels: ["dependencies"],
      files: ["package.json", "package-lock.json"],
    });
    expect(decide("land", state({ prs: [renovate] })).run).toBe(true);
    const human = pr({ author: "mame77" });
    expect(decide("land", state({ prs: [human] })).run).toBe(false);
  });

  it("develop が赤い間は修理の PR だけを扱う", () => {
    const s = state({ developHealth: "failure", prs: [pr()] });
    expect(decide("land", s).run).toBe(false);
    const mend = state({
      developHealth: "failure",
      prs: [pr({ labels: ["loop:mend"] })],
    });
    expect(decide("land", mend).run).toBe(true);
  });

  it("24時間のマージ数が上限に達したら起こさない", () => {
    const s = state({ prs: [pr()], mergedLoopPrs24h: 6 });
    expect(decide("land", s).run).toBe(false);
  });
});

describe("decide(patrol): 前回の巡回から画面か境界が変わったとき起こす", () => {
  it("巡回の記録が無ければ起こす", () => {
    expect(decide("patrol", state()).run).toBe(true);
  });

  it("画面・境界のコードが変わっていれば起こし、文書だけなら起こさない", () => {
    const logs = { patrol: { sha: "a".repeat(40), at: hoursAgo(5) } };
    expect(
      decide(
        "patrol",
        state({ logs, changedPathsSince: () => ["features/room/ui/a.tsx"] }),
      ).run,
    ).toBe(true);
    expect(
      decide("patrol", state({ logs, changedPathsSince: () => ["docs/a.md"] }))
        .run,
    ).toBe(false);
  });
});

describe("decide(garden): 前回の庭仕事から develop が進んだとき起こす", () => {
  it("記録が無い・develop が進んだなら起こし、同じなら起こさない", () => {
    expect(decide("garden", state()).run).toBe(true);
    expect(
      decide("garden", state({ logs: { garden: { sha: "a".repeat(40) } } }))
        .run,
    ).toBe(true);
    expect(
      decide("garden", state({ logs: { garden: { sha: "b".repeat(40) } } }))
        .run,
    ).toBe(false);
  });
});

describe("decide(replan): 待ち行列を作り直す必要があるとき起こす", () => {
  const recent = { replan: { at: hoursAgo(1) } };

  it("記録が無い・拾える Issue が無いなら起こす", () => {
    expect(decide("replan", state({ issues: [issue()] })).run).toBe(true);
    expect(decide("replan", state({ logs: recent })).run).toBe(true);
  });

  it("行き詰まりが3件たまったら起こす", () => {
    const blocked = [1, 2, 3].map((n) =>
      issue({ number: n, labels: ["loop:finish", "loop:blocked"] }),
    );
    const s = state({
      logs: recent,
      issues: [issue({ number: 9 }), ...blocked],
    });
    expect(decide("replan", s).run).toBe(true);
  });

  it("3時間動きの無い着手中の Issue があれば起こす", () => {
    const s = state({
      logs: recent,
      issues: [
        issue({ number: 9 }),
        issue({
          labels: ["loop:finish", "loop:claimed"],
          updatedAt: hoursAgo(4),
        }),
      ],
    });
    expect(decide("replan", s).run).toBe(true);
  });

  it("前回以降にループの Issue が動けば起こし、ループ外の Issue の動きでは起こさない", () => {
    const moved = state({
      logs: recent,
      issues: [issue({ updatedAt: hoursAgo(0.5) })],
    });
    expect(decide("replan", moved).run).toBe(true);
    const other = state({
      logs: recent,
      issues: [
        issue(),
        issue({ number: 2, labels: ["task"], updatedAt: hoursAgo(0.1) }),
      ],
    });
    expect(decide("replan", other).run).toBe(false);
  });
});

describe("rollupHealth: PR の検査結果を、検査ごとの最新の実行でまとめる", () => {
  it("失敗があれば failure、未完了があれば pending、ほかは success", () => {
    expect(
      rollupHealth([
        { name: "a", status: "COMPLETED", conclusion: "SUCCESS" },
        { name: "b", status: "COMPLETED", conclusion: "FAILURE" },
      ]),
    ).toBe("failure");
    expect(
      rollupHealth([
        { name: "a", status: "COMPLETED", conclusion: "SUCCESS" },
        { context: "c", state: "PENDING" },
      ]),
    ).toBe("pending");
    expect(
      rollupHealth([
        { name: "a", status: "COMPLETED", conclusion: "SKIPPED" },
        { context: "c", state: "SUCCESS" },
      ]),
    ).toBe("success");
  });

  it("置き換えられて取り消された古い実行は数えない", () => {
    const old = {
      name: "browser",
      workflowName: "Browser",
      startedAt: "2026-11-24T01:00:00Z",
      status: "COMPLETED",
      conclusion: "CANCELLED",
    };
    expect(
      rollupHealth([
        old,
        { ...old, startedAt: "2026-11-24T01:05:00Z", conclusion: "SUCCESS" },
      ]),
    ).toBe("success");
    expect(
      rollupHealth([
        old,
        {
          ...old,
          startedAt: "2026-11-24T01:05:00Z",
          status: "IN_PROGRESS",
          conclusion: "",
        },
      ]),
    ).toBe("pending");
  });

  it("起動に失敗した実行は failure", () => {
    expect(
      rollupHealth([
        { name: "a", status: "COMPLETED", conclusion: "STARTUP_FAILURE" },
      ]),
    ).toBe("failure");
  });
});

describe("healthFromRuns: develop の健康は、取り消されていない最新の完了した実行で決める", () => {
  it("最新が実行中でも、その前の失敗を隠さない", () => {
    expect(
      healthFromRuns([
        [
          { status: "in_progress", conclusion: "" },
          { status: "completed", conclusion: "failure" },
        ],
      ]),
    ).toBe("failure");
  });

  it("取り消された実行は飛ばす", () => {
    expect(
      healthFromRuns([
        [
          { status: "completed", conclusion: "cancelled" },
          { status: "completed", conclusion: "success" },
        ],
        [{ status: "completed", conclusion: "success" }],
      ]),
    ).toBe("success");
  });
});

describe("lastLog: 記録 Issue のうち、ループのアカウントが書いた最新の記録だけを読む", () => {
  it("他の人のコメントと sha の無いコメントを飛ばす", () => {
    const sha = "a".repeat(40);
    expect(
      lastLog(
        [
          { author: ACTOR, body: `sha: ${sha}\n巡回`, createdAt: hoursAgo(5) },
          {
            author: "someone",
            body: `sha: ${"f".repeat(40)}`,
            createdAt: hoursAgo(2),
          },
          { author: ACTOR, body: "メモ", createdAt: hoursAgo(1) },
        ],
        ACTOR,
        true,
      ),
    ).toEqual({ sha, at: hoursAgo(5) });
  });

  it("sha が要らない記録（再計画）は最新の自分のコメントの時刻を読む", () => {
    expect(
      lastLog(
        [
          { author: ACTOR, body: "a", createdAt: hoursAgo(3) },
          { author: "someone", body: "b", createdAt: hoursAgo(1) },
        ],
        ACTOR,
        false,
      ),
    ).toEqual({ sha: undefined, at: hoursAgo(3) });
  });
});

describe("landMark: land が残した印から、前回見た head とその後の動きを読む", () => {
  const head = "c".repeat(40);
  it("印より後に他の人のコメントかレビューがあれば動きあり", () => {
    const comments = [
      {
        author: ACTOR,
        body: `<!-- loop:land head=${head} -->`,
        createdAt: hoursAgo(2),
      },
      { author: "coderabbitai", body: "指摘", createdAt: hoursAgo(1) },
    ];
    expect(landMark(comments, [], ACTOR)).toEqual({
      landedHead: head,
      activityAfterLand: true,
    });
    expect(landMark(comments.slice(0, 1), [], ACTOR)).toEqual({
      landedHead: head,
      activityAfterLand: false,
    });
  });

  it("印が無ければ未確認", () => {
    expect(landMark([], [], ACTOR)).toEqual({
      landedHead: undefined,
      activityAfterLand: false,
    });
  });
});

describe("CLI: automation が一時ファイルの symlink 経由で起動しても判定する", () => {
  it("知らないループ名なら使い方を出して exit 2 で終わる（判定せずに exit 0 しない）", () => {
    const dir = mkdtempSync(join(tmpdir(), "ib-precheck-"));
    const link = join(dir, "precheck.mts");
    symlinkSync(resolve("scripts/loop/precheck.mts"), link);
    symlinkSync(resolve("scripts/loop/risk.mts"), join(dir, "risk.mts"));
    const r = spawnSync(process.execPath, ["--no-warnings", link, "unknown"], {
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage");
  });
});
