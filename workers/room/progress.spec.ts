import { describe, expect, it } from "vitest";
import { buildPhaseStep } from "../../contracts/phase.fixture";
import { hasStrictMajority, isManualProgressStep } from "./progress";

describe("phase progress", () => {
  it.each([
    [1, 1, true],
    [1, 2, false],
    [2, 3, true],
    [2, 4, false],
    [3, 5, true],
    [0, 0, false],
  ])("%i/%i は過半数=%s", (ready, connected, expected) => {
    expect(hasStrictMajority(ready, connected)).toBe(expected);
  });

  it("投票ステップは手動完了フラグの対象にしない", () => {
    expect(isManualProgressStep(buildPhaseStep(4, 1))).toBe(false);
    expect(isManualProgressStep(buildPhaseStep(3, 1))).toBe(true);
  });
});
