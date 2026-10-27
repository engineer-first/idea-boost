import { describe, expect, it } from "vitest";
import { buildPhaseStep } from "../../contracts/phase.fixture";
import { hasUnanimousReady, isManualProgressStep } from "./progress";

describe("phase progress", () => {
  it.each([
    [1, 1, true],
    [1, 2, false],
    [2, 3, false],
    [2, 4, false],
    [3, 5, false],
    [0, 0, false],
  ])("%i/%i は全員完了=%s", (ready, connected, expected) => {
    expect(hasUnanimousReady(ready, connected)).toBe(expected);
  });

  it("投票ステップでも手動完了を受け付ける", () => {
    expect(isManualProgressStep(buildPhaseStep(4, 1))).toBe(true);
    expect(isManualProgressStep(buildPhaseStep(3, 1))).toBe(true);
  });
});
