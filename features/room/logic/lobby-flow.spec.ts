import { describe, expect, it } from "vitest";
import { PHASE_STEP_COUNTS, ROOM_PHASE_STEP_LABELS } from "@/contracts/phase";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { getFacilitationGuide } from "./facilitation-guide";
import { getLobbyFlowOverview } from "./lobby-flow";

describe("getLobbyFlowOverview", () => {
  const overview = getLobbyFlowOverview();
  const steps = overview.phases.flatMap((phase) => phase.steps);

  it("3フェーズの全ステップを進行の順に並べる", () => {
    expect(overview.phases.map((phase) => phase.phase)).toEqual([1, 2, 3]);
    expect(steps.map((step) => step.number)).toEqual([
      "1-1",
      "1-2",
      "1-3",
      "1-4",
      "1-5",
      "2-1",
      "2-2",
      "2-3",
      "2-4",
      "3-1",
      "3-2",
      "3-3",
      "3-4",
      "3-5",
    ]);
    expect(steps).toHaveLength(
      PHASE_STEP_COUNTS[1] + PHASE_STEP_COUNTS[2] + PHASE_STEP_COUNTS[3],
    );
  });

  it("ステップ名は番号を除いたステップの呼び方、目安時間は進行ガイドの所要時間にする", () => {
    for (const step of steps) {
      const phase = step.phase as 1 | 2 | 3;
      const labels: Record<number, string> = ROOM_PHASE_STEP_LABELS[phase];
      expect(step.name).toBe(labels[step.step].replace(/^\d+-\d+\s*/, ""));
      expect(step.minutes).toBe(
        getFacilitationGuide(buildPhaseStep(step.step, phase))?.durationMinutes,
      );
    }
  });

  it("フェーズと全体の目安時間はステップの所要時間の合計にする", () => {
    expect(overview.phases.map((phase) => phase.minutes)).toEqual([26, 23, 31]);
    expect(overview.totalMinutes).toBe(80);
  });

  it("全ステップに14字以内のやることを1つ持たせる", () => {
    for (const step of steps) {
      expect(step.action.length, step.number).toBeGreaterThan(0);
      expect(step.action.length, step.number).toBeLessThanOrEqual(14);
    }
  });

  it("ステップの種類を書く・共有・グループ化・投票・決定・2軸マップに分ける", () => {
    expect(
      Object.fromEntries(steps.map((step) => [step.number, step.kind])),
    ).toEqual({
      "1-1": "write",
      "1-2": "share",
      "1-3": "group",
      "1-4": "vote",
      "1-5": "decide",
      "2-1": "write",
      "2-2": "share",
      "2-3": "vote",
      "2-4": "decide",
      "3-1": "write",
      "3-2": "share",
      "3-3": "map",
      "3-4": "vote",
      "3-5": "decide",
    });
  });
});
