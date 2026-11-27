// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type BuildState,
  decideBuild,
  decideMend,
  decidePatrol,
  decidePolish,
  decideRelease,
  decideReplan,
  isFailingPr,
  isReady,
  isStalledPr,
  isStopped,
  lastLog,
  latestConclusionFailed,
  type PatrolState,
  type ReleaseState,
} from "./precheck.mts";

const NOW = Date.parse("2026-11-24T12:00:00+09:00");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const ACTOR = "loop-bot";
const SHA = "a".repeat(40);

const state = (over: Partial<PatrolState> = {}): PatrolState => ({
  stopped: false,
  openFindings: 0,
  maxOpenFindings: 5,
  lastSha: SHA,
  changedPathsSince: () => ["features/room/ui/room-shell.tsx"],
  ...over,
});

describe("isStopped: チームの誰でも loop:stop 1つで止められる", () => {
  it("open の Issue か PR のどちらかに loop:stop があれば止める", () => {
    expect(isStopped([{ labels: ["bug"] }])).toBe(false);
    expect(isStopped([{ labels: ["bug"] }, { labels: ["loop:stop"] }])).toBe(
      true,
    );
  });
});

describe("decidePatrol: 前回の巡回から画面か境界が変わり、所見を読む余裕があるとき起こす", () => {
  it("止められていれば起こさない", () => {
    expect(decidePatrol(state({ stopped: true })).run).toBe(false);
  });

  it("読まれていない所見がたまっていれば起こさない", () => {
    const d = decidePatrol(state({ openFindings: 8, maxOpenFindings: 8 }));
    expect(d.run).toBe(false);
    expect(d.reason).toContain("8");
    expect(
      decidePatrol(state({ openFindings: 7, maxOpenFindings: 8 })).run,
    ).toBe(true);
  });

  it("巡回の記録が無ければ起こす", () => {
    expect(decidePatrol(state({ lastSha: undefined })).run).toBe(true);
  });

  it("画面・境界のコードが変わっていれば起こし、文書だけなら起こさない", () => {
    expect(decidePatrol(state()).run).toBe(true);
    expect(
      decidePatrol(
        state({
          changedPathsSince: () => ["docs/prd.md", ".github/workflows/ci.yml"],
        }),
      ).run,
    ).toBe(false);
  });
});

const issue = (labels: string[], assignees: string[] = []) => ({
  labels,
  assignees,
});

describe("isReady: build が拾ってよい Issue", () => {
  it("loop:ready があり、着手中・詰まり・人の判断待ち・除外が無いものだけ", () => {
    expect(isReady(issue(["loop:ready"]), ACTOR)).toBe(true);
    expect(isReady(issue(["bug"]), ACTOR)).toBe(false);
    for (const l of ["claimed", "blocked", "needs-human", "loop:skip"])
      expect(isReady(issue(["loop:ready", l]), ACTOR)).toBe(false);
  });

  it("オーナー以外の担当者がいる Issue は人の作業なので拾わない", () => {
    expect(isReady(issue(["loop:ready"], [ACTOR]), ACTOR)).toBe(true);
    expect(isReady(issue(["loop:ready"], ["teammate"]), ACTOR)).toBe(false);
  });
});

describe("latestConclusionFailed: develop の最新の完了した run が失敗か", () => {
  it("実行中の run は飛ばし、完了した最新の結果で決める", () => {
    expect(
      latestConclusionFailed([
        { status: "in_progress", conclusion: "" },
        { status: "completed", conclusion: "failure" },
      ]),
    ).toBe(true);
    expect(
      latestConclusionFailed([
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "failure" },
      ]),
    ).toBe(false);
    expect(latestConclusionFailed([])).toBe(false);
  });
});

describe("decideBuild: 拾える改善があり、develop が緑で、ループの PR が詰まっていないとき起こす", () => {
  const build = (over: Partial<BuildState> = {}): BuildState => ({
    stopped: false,
    developRed: false,
    openLoopPrs: 0,
    maxOpenLoopPrs: 2,
    ready: 1,
    stalledPrs: 0,
    ...over,
  });
  it("条件がそろえば起こす", () => {
    expect(decideBuild(build()).run).toBe(true);
  });
  it("止められている・develop が赤・PR が上限・拾える Issue が無いなら起こさない", () => {
    expect(decideBuild(build({ stopped: true })).run).toBe(false);
    expect(decideBuild(build({ developRed: true })).reason).toContain("mend");
    expect(decideBuild(build({ openLoopPrs: 2 })).run).toBe(false);
    expect(decideBuild(build({ ready: 0 })).run).toBe(false);
  });
});

describe("decideBuild: 止まっている PR があれば、新しい Issue より先に流すために起こす", () => {
  const base: BuildState = {
    stopped: false,
    developRed: false,
    openLoopPrs: 0,
    maxOpenLoopPrs: 2,
    ready: 0,
    stalledPrs: 1,
  };
  it("拾える Issue が無くても、ループの PR が上限でも起こす", () => {
    expect(decideBuild(base)).toEqual({
      run: true,
      reason: "止まっている PR が 1 本（先に流す）",
    });
    expect(decideBuild({ ...base, openLoopPrs: 2 }).run).toBe(true);
  });
  it("止められている・develop が赤なら起こさない", () => {
    expect(decideBuild({ ...base, stopped: true }).run).toBe(false);
    expect(decideBuild({ ...base, developRed: true }).run).toBe(false);
  });
});

describe("isStalledPr: ループが流す PR が1時間動いていなければ止まっている", () => {
  const pr = (over: Partial<Parameters<typeof isStalledPr>[0]> = {}) => ({
    labels: ["loop"],
    author: ACTOR,
    updatedAt: hoursAgo(2),
    ...over,
  });
  it("ループの PR（loop ラベル・ループのアカウント）が1時間動いていなければ止まっている", () => {
    expect(isStalledPr(pr(), ACTOR, NOW)).toBe(true);
  });
  it("Renovate の依存更新 PR も同じ（メジャー・0.x・CI が落ちたまとめ PR）", () => {
    expect(
      isStalledPr(
        pr({ labels: ["dependencies"], author: "app/renovate" }),
        ACTOR,
        NOW,
      ),
    ).toBe(true);
  });
  it("動きがあって1時間たっていなければ、周回が作業中とみなす", () => {
    expect(isStalledPr(pr({ updatedAt: hoursAgo(0.5) }), ACTOR, NOW)).toBe(
      false,
    );
  });
  it("人の PR は、ラベルが付いていても数えない", () => {
    expect(isStalledPr(pr({ author: "teammate" }), ACTOR, NOW)).toBe(false);
    expect(
      isStalledPr(
        pr({ labels: ["dependencies"], author: "teammate" }),
        ACTOR,
        NOW,
      ),
    ).toBe(false);
    expect(isStalledPr(pr({ labels: [] }), ACTOR, NOW)).toBe(false);
  });
  it("必須チェックが落ちたか競合した PR は、15分動きが無ければすぐ止まっているとみなす", () => {
    // 周回は auto-merge を予約して抜けるので、落ちた PR を直す周回は残っていない。
    // 1時間待たずに次の build で拾う。直している周回の push を奪わないよう15分は待つ。
    const hours = (h: number) => hoursAgo(h);
    expect(
      isStalledPr(pr({ updatedAt: hours(0.3), failing: true }), ACTOR, NOW),
    ).toBe(true);
    expect(
      isStalledPr(pr({ updatedAt: hours(0.2), failing: true }), ACTOR, NOW),
    ).toBe(false);
    expect(
      isStalledPr(pr({ updatedAt: hours(0.3), failing: false }), ACTOR, NOW),
    ).toBe(false);
  });
  it.each(["needs-human", "blocked", "loop:skip"])(
    "%s が付いた PR は数えない（同じ PR で起こし続けない）",
    (label) => {
      expect(isStalledPr(pr({ labels: ["loop", label] }), ACTOR, NOW)).toBe(
        false,
      );
    },
  );
});

describe("isFailingPr: auto-merge が進まない PR を見分ける", () => {
  it("必須チェックが落ちたか、develop と競合していれば進まない", () => {
    expect(
      isFailingPr({
        statusCheckRollup: [{ name: "browser", conclusion: "FAILURE" }],
      }),
    ).toBe(true);
    expect(isFailingPr({ mergeable: "CONFLICTING" })).toBe(true);
  });
  it("同じ名前のチェックは最後に始まった実行だけを見る（再実行で通った失敗は数えない）", () => {
    expect(
      isFailingPr({
        statusCheckRollup: [
          {
            name: "browser",
            conclusion: "FAILURE",
            startedAt: "2026-11-27T03:00:00Z",
          },
          {
            name: "browser",
            conclusion: "SUCCESS",
            startedAt: "2026-11-27T03:10:00Z",
          },
        ],
      }),
    ).toBe(false);
  });
  it("必須でないチェックの失敗と、実行中・成功は数えない（auto-merge はそのまま進む）", () => {
    expect(
      isFailingPr({
        mergeable: "MERGEABLE",
        statusCheckRollup: [
          { name: "chromatic", conclusion: "FAILURE" },
          { name: "test", conclusion: "" },
          { name: "lint", conclusion: "SUCCESS" },
        ],
      }),
    ).toBe(false);
  });
});

describe("decidePolish: 前回から2時間以上たち、develop が緑のとき起こす", () => {
  const now = NOW;
  it("前回の記録から2時間たっていなければ起こさない", () => {
    const base = {
      stopped: false,
      developRed: false,
      openLoopPrs: 0,
      maxOpenLoopPrs: 2,
      now,
    };
    expect(decidePolish({ ...base, lastAt: hoursAgo(1) }).run).toBe(false);
    expect(decidePolish({ ...base, lastAt: hoursAgo(3) }).run).toBe(true);
    expect(decidePolish({ ...base, lastAt: undefined }).run).toBe(true);
    expect(
      decidePolish({ ...base, lastAt: undefined, developRed: true }).run,
    ).toBe(false);
    expect(
      decidePolish({ ...base, lastAt: undefined, openLoopPrs: 2 }).run,
    ).toBe(false);
  });
});

describe("decideMend: develop の CI か Browser が赤のときだけ起こす", () => {
  it("赤なら起こし、緑なら起こさない。止められていれば起こさない", () => {
    expect(decideMend({ stopped: false, developRed: true }).run).toBe(true);
    expect(decideMend({ stopped: false, developRed: false }).run).toBe(false);
    expect(decideMend({ stopped: true, developRed: true }).run).toBe(false);
  });
});

describe("decideRelease: 本番より develop が進み、止める理由が無いとき列車を出す", () => {
  const rel = (over: Partial<ReleaseState> = {}): ReleaseState => ({
    stopped: false,
    p0Open: 0,
    developRed: false,
    aheadBy: 3,
    releaseRunActive: false,
    ...over,
  });
  it("条件がそろえば起こす", () => {
    expect(decideRelease(rel()).run).toBe(true);
  });
  it("P0・赤・差分なし・実行中・停止のどれかで起こさない", () => {
    expect(decideRelease(rel({ p0Open: 1 })).reason).toContain("P0");
    expect(decideRelease(rel({ developRed: true })).run).toBe(false);
    expect(decideRelease(rel({ aheadBy: 0 })).run).toBe(false);
    expect(decideRelease(rel({ releaseRunActive: true })).run).toBe(false);
    expect(decideRelease(rel({ stopped: true })).run).toBe(false);
  });
});

describe("decideReplan: 拾える改善が減ったか、詰まりがたまったとき起こす", () => {
  it("未着手が3件未満か blocked が3件以上で起こす", () => {
    expect(decideReplan({ stopped: false, ready: 2, blocked: 0 }).run).toBe(
      true,
    );
    expect(decideReplan({ stopped: false, ready: 5, blocked: 3 }).run).toBe(
      true,
    );
    expect(decideReplan({ stopped: false, ready: 5, blocked: 0 }).run).toBe(
      false,
    );
    expect(decideReplan({ stopped: true, ready: 0, blocked: 0 }).run).toBe(
      false,
    );
  });
});

describe("lastLog: 記録 Issue のうち、ループのアカウントが書いた最新の記録だけを読む", () => {
  it("他の人のコメントと sha の無いコメントを飛ばす", () => {
    expect(
      lastLog(
        [
          { author: ACTOR, body: `sha: ${SHA}\n巡回`, createdAt: hoursAgo(5) },
          {
            author: "someone",
            body: `sha: ${"f".repeat(40)}`,
            createdAt: hoursAgo(2),
          },
          { author: ACTOR, body: "メモ", createdAt: hoursAgo(1) },
        ],
        ACTOR,
      ),
    ).toEqual({ sha: SHA, at: hoursAgo(5) });
  });
});

describe("CLI: automation が一時ファイルの symlink 経由で起動しても判定する", () => {
  it("知らないループ名なら使い方を出して exit 2 で終わる（判定せずに exit 0 しない）", () => {
    const dir = mkdtempSync(join(tmpdir(), "ib-precheck-"));
    const link = join(dir, "precheck.mts");
    symlinkSync(resolve("scripts/loop/precheck.mts"), link);
    const r = spawnSync(process.execPath, ["--no-warnings", link, "unknown"], {
      encoding: "utf8",
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage");
  });
});
