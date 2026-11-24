// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  decide,
  type LoopIssue,
  type LoopPr,
  type LoopState,
  rollupHealth,
} from "./precheck.mts";

const NOW = Date.parse("2026-11-24T12:00:00+09:00");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

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
  author: "junhat6",
  checks: "success",
  ...over,
});

const state = (over: Partial<LoopState> = {}): LoopState => ({
  now: NOW,
  developHead: "b".repeat(40),
  developHealth: "success",
  issues: [],
  prs: [],
  logs: {},
  changedPathsSince: () => [],
  maxOpenLoopPrs: 2,
  ...over,
});

describe("decide(mend): develop が赤いときだけ修理を起こす", () => {
  it("develop の最新 CI が失敗していれば起こす", () => {
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

describe("decide(finish): 拾える Issue があり、PR の枠が空いているとき起こす", () => {
  it("未着手・担当者なしの loop Issue があれば起こす", () => {
    expect(decide("finish", state({ issues: [issue()] })).run).toBe(true);
  });

  it("チームの誰かが担当している Issue は拾わない", () => {
    const s = state({ issues: [issue({ assignees: ["mame77"] })] });
    expect(decide("finish", s).run).toBe(false);
  });

  it("着手中・行き詰まり・人の判断待ちの Issue は拾わない", () => {
    for (const label of ["loop:claimed", "loop:blocked", "needs-human"]) {
      const s = state({ issues: [issue({ labels: ["loop:ux", label] })] });
      expect(decide("finish", s).run).toBe(false);
    }
  });

  it("loop ラベルの無い Issue は拾わない", () => {
    const s = state({ issues: [issue({ labels: ["task"] })] });
    expect(decide("finish", s).run).toBe(false);
  });

  it("loop の開いた PR が上限に達していれば起こさない", () => {
    const s = state({
      issues: [issue()],
      prs: [pr({ number: 1 }), pr({ number: 2, labels: ["loop:ux"] })],
    });
    expect(decide("finish", s).run).toBe(false);
  });

  it("人の PR は上限に数えない", () => {
    const s = state({
      issues: [issue()],
      prs: [pr({ labels: [] }), pr({ number: 11, labels: ["dependencies"] })],
    });
    expect(decide("finish", s).run).toBe(true);
  });

  it("develop が赤い間は新しい仕事を始めない", () => {
    const s = state({ issues: [issue()], developHealth: "failure" });
    expect(decide("finish", s).run).toBe(false);
  });
});

describe("decide(land): 検査を終えた PR があるとき取り込みを起こす", () => {
  it("検査が終わった loop の PR があれば起こす", () => {
    expect(decide("land", state({ prs: [pr()] })).run).toBe(true);
    const failed = state({ prs: [pr({ checks: "failure" })] });
    expect(decide("land", failed).run).toBe(true);
  });

  it("Draft・検査中・人の判断待ちの PR しか無ければ起こさない", () => {
    const s = state({
      prs: [
        pr({ isDraft: true }),
        pr({ number: 11, checks: "pending" }),
        pr({ number: 12, labels: ["loop:finish", "needs-human"] }),
      ],
    });
    expect(decide("land", s).run).toBe(false);
  });

  it("Renovate の PR も対象にし、人の PR は対象にしない", () => {
    const renovate = pr({ author: "app/renovate", labels: ["dependencies"] });
    expect(decide("land", state({ prs: [renovate] })).run).toBe(true);
    const human = pr({ author: "mame77", labels: [] });
    expect(decide("land", state({ prs: [human] })).run).toBe(false);
  });
});

describe("decide(patrol): 前回の巡回から画面か境界が変わったとき起こす", () => {
  it("巡回の記録が無ければ起こす", () => {
    expect(decide("patrol", state()).run).toBe(true);
  });

  it("画面・境界のコードが変わっていれば起こす", () => {
    const s = state({
      logs: { patrol: { sha: "a".repeat(40), at: hoursAgo(5) } },
      changedPathsSince: () => ["features/room/ui/board.tsx"],
    });
    expect(decide("patrol", s).run).toBe(true);
  });

  it("文書だけの変更なら起こさない", () => {
    const s = state({
      logs: { patrol: { sha: "a".repeat(40), at: hoursAgo(5) } },
      changedPathsSince: () => ["docs/prd.md", ".agents/skills/pbi/SKILL.md"],
    });
    expect(decide("patrol", s).run).toBe(false);
  });
});

describe("decide(garden): 前回の庭仕事から develop が進んだとき起こす", () => {
  it("記録が無い・develop が進んだなら起こす", () => {
    expect(decide("garden", state()).run).toBe(true);
    const moved = state({ logs: { garden: { sha: "a".repeat(40) } } });
    expect(decide("garden", moved).run).toBe(true);
  });

  it("前回と同じ develop なら起こさない", () => {
    const s = state({ logs: { garden: { sha: "b".repeat(40) } } });
    expect(decide("garden", s).run).toBe(false);
  });
});

describe("decide(replan): 待ち行列を作り直す必要があるとき起こす", () => {
  const recent = { replan: { at: hoursAgo(1) } };

  it("記録が無ければ起こす", () => {
    expect(decide("replan", state({ issues: [issue()] })).run).toBe(true);
  });

  it("拾える Issue が無くなったら起こす", () => {
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

  it("前回以降に Issue が動いていれば起こし、動きが無ければ起こさない", () => {
    const moved = state({
      logs: recent,
      issues: [issue({ updatedAt: hoursAgo(0.5) })],
    });
    expect(decide("replan", moved).run).toBe(true);
    const still = state({ logs: recent, issues: [issue()] });
    expect(decide("replan", still).run).toBe(false);
  });
});

describe("rollupHealth: PR の検査結果を1つにまとめる", () => {
  it("失敗が1つでもあれば failure、未完了があれば pending、ほかは success", () => {
    expect(
      rollupHealth([
        { status: "COMPLETED", conclusion: "SUCCESS" },
        { status: "COMPLETED", conclusion: "FAILURE" },
        { status: "IN_PROGRESS" },
      ]),
    ).toBe("failure");
    expect(
      rollupHealth([
        { status: "COMPLETED", conclusion: "SUCCESS" },
        { state: "PENDING" },
      ]),
    ).toBe("pending");
    expect(
      rollupHealth([
        { status: "COMPLETED", conclusion: "SKIPPED" },
        { state: "SUCCESS" },
      ]),
    ).toBe("success");
  });
});
