import { describe, expect, it } from "vitest";
import {
  getRoomPhaseLabel,
  isAtOrAfterGroupingStep,
  isLobby,
  isPhaseStep,
  isResultStep,
  isVotingStep,
  PHASE_STEP_COUNTS,
  RoomPhaseSchema,
} from "./phase";
import { buildLobbyPhase, buildPhaseStep } from "./phase.fixture";

describe("RoomPhaseSchema", () => {
  it("lobby と全フェーズの有効なステップを受け入れる", () => {
    expect(PHASE_STEP_COUNTS).toEqual({ 1: 5, 2: 4, 3: 5 });
    expect(RoomPhaseSchema.parse(buildLobbyPhase())).toEqual(buildLobbyPhase());
    expect(RoomPhaseSchema.parse(buildPhaseStep(1))).toEqual(buildPhaseStep(1));
    expect(RoomPhaseSchema.parse(buildPhaseStep(5))).toEqual(buildPhaseStep(5));
    expect(RoomPhaseSchema.parse({ kind: "step", phase: 2, step: 4 })).toEqual(
      buildPhaseStep(4, 2),
    );
    expect(RoomPhaseSchema.parse({ kind: "step", phase: 3, step: 5 })).toEqual(
      buildPhaseStep(5, 3),
    );
  });

  it.each([
    { kind: "step", phase: 1, step: 0 },
    { kind: "step", phase: 1, step: 6 },
    { kind: "step", phase: 2, step: 5 },
    { kind: "step", phase: 3, step: 6 },
    { kind: "step", phase: 4, step: 1 },
    { kind: "step", phase: 1, step: 1.5 },
    { kind: "unknown" },
    "phase1",
  ])("未実装フェーズ・範囲外ステップ・未知の状態を拒否する: %o", (value) => {
    expect(RoomPhaseSchema.safeParse(value).success).toBe(false);
  });
});

describe("RoomPhase の判定ヘルパー", () => {
  it.each([
    {
      phase: buildLobbyPhase(),
      expectedPhase: 1,
      expectedStep: 1,
      lobby: true,
      grouping: false,
      voting: false,
      result: false,
    },
    {
      phase: buildPhaseStep(1),
      expectedPhase: 1,
      expectedStep: 1,
      lobby: false,
      grouping: false,
      voting: false,
      result: false,
    },
    {
      phase: buildPhaseStep(2),
      expectedPhase: 1,
      expectedStep: 2,
      lobby: false,
      grouping: false,
      voting: false,
      result: false,
    },
    {
      phase: buildPhaseStep(3),
      expectedPhase: 1,
      expectedStep: 3,
      lobby: false,
      grouping: true,
      voting: false,
      result: false,
    },
    {
      phase: buildPhaseStep(4),
      expectedPhase: 1,
      expectedStep: 4,
      lobby: false,
      grouping: true,
      voting: true,
      result: false,
    },
    {
      phase: buildPhaseStep(5),
      expectedPhase: 1,
      expectedStep: 5,
      lobby: false,
      grouping: true,
      voting: false,
      result: true,
    },
    {
      phase: buildPhaseStep(3, 2),
      expectedPhase: 2,
      expectedStep: 3,
      lobby: false,
      grouping: false,
      voting: true,
      result: false,
    },
    {
      phase: buildPhaseStep(4, 2),
      expectedPhase: 2,
      expectedStep: 4,
      lobby: false,
      grouping: false,
      voting: false,
      result: true,
    },
    {
      phase: buildPhaseStep(4, 3),
      expectedPhase: 3,
      expectedStep: 4,
      lobby: false,
      grouping: false,
      voting: true,
      result: false,
    },
    {
      phase: buildPhaseStep(5, 3),
      expectedPhase: 3,
      expectedStep: 5,
      lobby: false,
      grouping: false,
      voting: false,
      result: true,
    },
  ])("$phase の判定結果を返す", ({
    phase,
    expectedPhase,
    expectedStep,
    lobby,
    grouping,
    voting,
    result,
  }) => {
    expect(isLobby(phase)).toBe(lobby);
    expect(isPhaseStep(phase, expectedPhase, expectedStep)).toBe(!lobby);
    expect(isAtOrAfterGroupingStep(phase)).toBe(grouping);
    expect(isVotingStep(phase)).toBe(voting);
    expect(isResultStep(phase)).toBe(result);
  });

  it("異なるステップは isPhaseStep で false になる", () => {
    expect(isPhaseStep(buildPhaseStep(2), 1, 1)).toBe(false);
  });
});

describe("RoomPhase の表示ラベル", () => {
  it.each([
    [buildLobbyPhase(), "開始待ち"],
    [buildPhaseStep(1), "1-1 自分の課題（個人）"],
    [buildPhaseStep(2), "1-2 課題共有"],
    [buildPhaseStep(3), "1-3 グループ化"],
    [buildPhaseStep(4), "1-4 投票"],
    [buildPhaseStep(5), "1-5 課題決定"],
    [buildPhaseStep(1, 2), "2-1 課題に対するHMW（個人）"],
    [buildPhaseStep(2, 2), "2-2 HMW共有"],
    [buildPhaseStep(3, 2), "2-3 投票"],
    [buildPhaseStep(4, 2), "2-4 HMW決定"],
    [buildPhaseStep(1, 3), "3-1 アイデアを書き出す（個人）"],
    [buildPhaseStep(2, 3), "3-2 共有・分類（チーム）"],
    [buildPhaseStep(3, 3), "3-3 価値×実現のしやすさで評価"],
    [buildPhaseStep(4, 3), "3-4 ドット投票"],
    [buildPhaseStep(5, 3), "3-5 アイデアを決定"],
    [{ kind: "step", phase: 4, step: 1 } as const, "フェーズ4・ステップ1"],
  ] as const)("%o を %s と表示する", (phase, label) => {
    expect(getRoomPhaseLabel(phase)).toBe(label);
  });
});
