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

describe("分類後のグループ枠", () => {
  const groups = [
    { id: "g1", name: "通学", noteIds: ["a", "b", "c"] },
    { id: "g2", name: "部活", noteIds: ["d"] },
  ];
  it("除外した付箋は枠に入れない", () => {
    const notes = [
      buildNote({ id: "a", x: 100, y: 100 }),
      buildNote({ id: "b", x: 320, y: 100 }),
      buildNote({ id: "c", x: 2000, y: 2000, excluded: true }),
      buildNote({ id: "d", x: 1000, y: 100, excluded: true }),
    ];
    const rendered = getBoardRenderGroups(notes, groups, buildPhaseStep(5));
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toMatchObject({
      persistentGroupId: "g1",
      name: "通学",
      x: 84,
      y: 84,
    });
    expect(rendered[0].x + rendered[0].width).toBeLessThan(1000);
    expect(rendered[0].y + rendered[0].height).toBeLessThan(1000);
  });
  it("離れて置いた所属付箋には、同じ色・名前の枠を別々に描く", () => {
    const notes = [
      buildNote({ id: "a", x: 100, y: 100 }),
      buildNote({ id: "b", x: 320, y: 100 }),
      buildNote({ id: "c", x: 900, y: 900 }),
      buildNote({ id: "d", x: 1400, y: 100 }),
    ];
    const rendered = getBoardRenderGroups(notes, groups, buildPhaseStep(4));
    const g1Frames = rendered.filter(
      (group) => group.persistentGroupId === "g1",
    );
    expect(g1Frames).toHaveLength(2);
    expect(new Set(g1Frames.map((group) => group.name))).toEqual(
      new Set(["通学"]),
    );
    expect(new Set(g1Frames.map((group) => group.hue)).size).toBe(1);
    expect(new Set(rendered.map((group) => group.id)).size).toBe(
      rendered.length,
    );
    const lone = g1Frames.find((group) => group.x === 884);
    expect(lone).toMatchObject({ y: 884 });
    expect(lone && lone.x + lone.width).toBeLessThan(900 + 300);
    const main = g1Frames.find((group) => group.x === 84);
    expect(main && main.x + main.width).toBeLessThan(900);
  });
});
