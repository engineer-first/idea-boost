import { describe, expect, it } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { getNextStepShortName, STEP_SHORT_NAMES } from "./phase-labels";

// 中央上部のステップの並びと同じ呼び方。フェーズの最後は次のフェーズ、最後は成果。
const NEXT_NAMES = {
  1: ["共有", "整理", "投票", "決定", "問い"],
  2: ["共有", "投票", "決定", "アイデア"],
  3: ["共有", "2軸評価", "投票", "決定", "成果"],
} as const;

describe("次のステップの短い呼び方", () => {
  const cases = ([1, 2, 3] as const).flatMap((phase) =>
    NEXT_NAMES[phase].map((name, index) => ({ phase, step: index + 1, name })),
  );

  it.each(cases)(
    "$phase-$step の次は「$name」と示す",
    ({ phase, step, name }) => {
      expect(getNextStepShortName(buildPhaseStep(step, phase))).toBe(name);
    },
  );

  it("フェーズの途中では、次のステップを並びと同じ呼び方で示す", () => {
    expect(getNextStepShortName(buildPhaseStep(2, 3))).toBe(
      STEP_SHORT_NAMES[3][2],
    );
  });
});
