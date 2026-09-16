import { describe, expect, it } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { getBoardPermissions } from "./board-permissions";

describe("getBoardPermissions", () => {
  it("フェーズ1 Step 1-5 では共有付箋の移動と除外候補一覧を許可する", () => {
    expect(getBoardPermissions(buildPhaseStep(5))).toMatchObject({
      canMoveNote: true,
      canExcludeNote: true,
      canShowExcludedNotes: true,
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
    expect(getBoardPermissions(buildPhaseStep(5, 3))).toEqual({
      ...getBoardPermissions(buildPhaseStep(5)),
      canMoveNote: false,
      canExcludeNote: false,
      canShowExcludedNotes: false,
    });
  });
});
