import { describe, expect, it } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { getBoardRenderGroups } from "./board-render-groups";

describe("追加執筆でのグループ参照", () => {
  const notes = [
    buildNote({ id: "shared-a", x: 100, y: 100 }),
    buildNote({ id: "shared-b", x: 320, y: 100 }),
  ];
  const groups = [
    {
      id: "shared-group",
      name: "残しておくまとまり",
      noteIds: ["shared-a", "shared-b"],
    },
  ];
  it("個人作業でも既存グループの所属と外枠をそのまま参照する", () => {
    expect(
      getBoardRenderGroups(notes, groups, buildPhaseStep(1), true),
    ).toEqual(getBoardRenderGroups(notes, groups, buildPhaseStep(4)));
    expect(getBoardRenderGroups(notes, groups, buildPhaseStep(1))).toEqual([]);
  });
  it("問い・アイデアの個人作業には課題のグループを持ち込まない", () => {
    for (const phase of [2, 3] as const)
      expect(
        getBoardRenderGroups(notes, groups, buildPhaseStep(1, phase), true),
      ).toEqual([]);
  });
});
