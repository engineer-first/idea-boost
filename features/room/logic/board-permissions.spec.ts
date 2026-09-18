import { describe, expect, it } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { getBoardPermissions } from "./board-permissions";

describe("getBoardPermissions", () => {
  it.each([
    [1, 5],
    [2, 4],
    [3, 5],
  ] as const)("フェーズ%i Step%i の決定ステップだけ候補外操作を許可する", (phase, step) => {
    expect(getBoardPermissions(buildPhaseStep(step, phase))).toMatchObject({
      canExcludeNote: true,
      canRestoreNote: true,
    });
  });

  it.each([
    [1, 4],
    [2, 3],
    [3, 4],
  ] as const)("フェーズ%i Step%i の投票ステップでは候補外操作を許可しない", (phase, step) => {
    expect(getBoardPermissions(buildPhaseStep(step, phase))).toMatchObject({
      canExcludeNote: false,
      canRestoreNote: false,
    });
  });

  it("フェーズ3のStep2〜5は、グループ操作を除きフェーズ1のStep2〜5と同じ流れを使う", () => {
    expect(getBoardPermissions(buildPhaseStep(2, 3))).toEqual(
      getBoardPermissions(buildPhaseStep(2)),
    );
    expect(getBoardPermissions(buildPhaseStep(3, 3))).toEqual({
      ...getBoardPermissions(buildPhaseStep(3)),
      canGroupNote: false,
    });
    expect(getBoardPermissions(buildPhaseStep(4, 3))).toEqual(
      getBoardPermissions(buildPhaseStep(4)),
    );
    expect(getBoardPermissions(buildPhaseStep(5, 3))).toEqual(
      getBoardPermissions(buildPhaseStep(5)),
    );
  });
});
