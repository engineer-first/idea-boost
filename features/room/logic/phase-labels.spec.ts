import { describe, expect, it } from "vitest";
import { PHASE_STEP_COUNTS } from "@/contracts/phase";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import {
  getNextStepShortName,
  PHASE_NUMBERS,
  PHASE_SHORT_NAMES,
  STEP_SHORT_NAMES,
} from "./phase-labels";

describe("次のステップの短い呼び方", () => {
  const steps = PHASE_NUMBERS.flatMap((phase) =>
    Array.from({ length: PHASE_STEP_COUNTS[phase] }, (_, index) => ({
      phase,
      step: index + 1,
    })),
  );

  it.each(steps)(
    "$phase-$step の次は、ステップの並びと同じ呼び方で示す",
    ({ phase, step }) => {
      const expected =
        step < PHASE_STEP_COUNTS[phase]
          ? STEP_SHORT_NAMES[phase][step]
          : phase < 3
            ? PHASE_SHORT_NAMES[(phase + 1) as 2 | 3]
            : "成果";
      expect(getNextStepShortName(buildPhaseStep(step, phase))).toBe(expected);
    },
  );

  it("3-2 の次は並びと同じ「2軸評価」と呼ぶ", () => {
    expect(getNextStepShortName(buildPhaseStep(2, 3))).toBe("2軸評価");
  });
});
