import { describe, expect, it } from "vitest";
import { getNoteHeight, NOTE_HEIGHT } from "./board";
import {
  calculateRenderGroups,
  type PersistentGroup,
  reorganizeGroups,
} from "./grouping";
import { buildNote } from "./room-protocol.fixture";

describe("calculateRenderGroups - 仮グループ（新規）", () => {
  it("付箋が空の場合は、グループも空であること", () => {
    const groups = calculateRenderGroups([], []);
    expect(groups).toEqual([]);
  });

  it("付箋が1つだけの場合は、グループは作成されないこと", () => {
    const note = buildNote({ id: "note-1", x: 100, y: 100 });
    const groups = calculateRenderGroups([note], []);
    expect(groups).toEqual([]);
  });

  it("2つの付箋が十分に離れている場合は、グループは作成されないこと", () => {
    const note1 = buildNote({ id: "note-1", x: 100, y: 100 });
    const note2 = buildNote({ id: "note-2", x: 361, y: 100 }); // 隙間 61px

    const groups = calculateRenderGroups([note1, note2], []);
    expect(groups).toEqual([]);
  });

  it("2つの付箋が近くにある場合は、仮グループ（名前: グループ）が作成されること", () => {
    const note1 = buildNote({ id: "note-1", x: 100, y: 100 });
    const note2 = buildNote({ id: "note-2", x: 360, y: 120 }); // 隙間 60px

    const groups = calculateRenderGroups([note1, note2], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("グループ");
    expect(groups[0].isTemp).toBe(true);
    expect(groups[0].representativeNoteId).toBe("note-1");
  });

  it("長文付箋の実高を近接判定と外枠へ反映する", () => {
    const content = "あ".repeat(240);
    const fontSize = 24;
    const tallHeight = getNoteHeight(content, fontSize);
    const note1 = buildNote({
      id: "note-1",
      content,
      fontSize,
      x: 100,
      y: 100,
    });
    const note2 = buildNote({
      id: "note-2",
      x: 100,
      y: 100 + tallHeight + 60,
    });

    const groups = calculateRenderGroups([note1, note2], []);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      y: 84,
      height: tallHeight + 60 + NOTE_HEIGHT + 32,
    });
  });
});

describe("reorganizeGroups - 自動再編成", () => {
  it("新規加入: グループの近くに無所属の付箋が来ると、自動的にメンバーに加わること", () => {
    // 既存グループ G1: [note-1, note-2]
    const note1 = buildNote({ id: "note-1", x: 100, y: 100 });
    const note2 = buildNote({ id: "note-2", x: 300, y: 100 });
    const note3 = buildNote({ id: "note-3", x: 500, y: 100 }); // note-2の右隣（隙間0px）

    const currentGroups: PersistentGroup[] = [
      { id: "g1", name: "課題A", noteIds: ["note-1", "note-2"] },
    ];

    const updated = reorganizeGroups([note1, note2, note3], currentGroups);
    expect(updated).toHaveLength(1);
    expect(updated[0].noteIds).toEqual(["note-1", "note-2", "note-3"]);
  });

  it("自動脱退: グループのメンバーの1つを引き離すと、グループから脱退し残りは存続すること", () => {
    // 既存グループ G1: [note-1, note-2, note-3]
    const note1 = buildNote({ id: "note-1", x: 100, y: 100 });
    const note2 = buildNote({ id: "note-2", x: 300, y: 100 });
    const note3 = buildNote({ id: "note-3", x: 1000, y: 100 }); // 遠くに離された

    const currentGroups: PersistentGroup[] = [
      { id: "g1", name: "課題A", noteIds: ["note-1", "note-2", "note-3"] },
    ];

    const updated = reorganizeGroups([note1, note2, note3], currentGroups);
    expect(updated).toHaveLength(1);
    expect(updated[0].noteIds).toEqual(["note-1", "note-2"]); // note-3 は脱退した
  });

  it("自動消滅: メンバー同士が離れて付箋が1個以下になると、グループが自動的に消滅すること", () => {
    // 既存グループ G1: [note-1, note-2]
    const note1 = buildNote({ id: "note-1", x: 100, y: 100 });
    const note2 = buildNote({ id: "note-2", x: 1000, y: 100 }); // 離された

    const currentGroups: PersistentGroup[] = [
      { id: "g1", name: "課題A", noteIds: ["note-1", "note-2"] },
    ];

    const updated = reorganizeGroups([note1, note2], currentGroups);
    expect(updated).toHaveLength(0); // メンバーが1個ずつに分裂したのでG1は消滅
  });

  it("合流時の維持: 2つのグループが近づいて合流しても、グループはマージされず個別に存続すること", () => {
    // G1: [note-1, note-2] (名前: 課題A)
    // G2: [note-3, note-4] (名前: 課題B)
    const note1 = buildNote({ id: "note-1", x: 100, y: 100 });
    const note2 = buildNote({ id: "note-2", x: 300, y: 100 });
    const note3 = buildNote({ id: "note-3", x: 500, y: 100 }); // G1とG2が合流（note-2とnote-3の隙間0px）
    const note4 = buildNote({ id: "note-4", x: 700, y: 100 });

    const currentGroups: PersistentGroup[] = [
      { id: "g1", name: "課題A", noteIds: ["note-1", "note-2"] },
      { id: "g2", name: "課題B", noteIds: ["note-3", "note-4"] },
    ];

    const updated = reorganizeGroups(
      [note1, note2, note3, note4],
      currentGroups,
    );
    expect(updated).toHaveLength(2);

    const g1 = updated.find((g) => g.id === "g1");
    const g2 = updated.find((g) => g.id === "g2");
    expect(g1?.noteIds).toEqual(["note-1", "note-2"]);
    expect(g2?.noteIds).toEqual(["note-3", "note-4"]);
  });
});

describe("calculateRenderGroups - 合体時の単一上書き描画", () => {
  it("2つのグループが合流したとき、入れ子にならず単一の大きな枠が表示され、名前は支配的グループのものになること", () => {
    const note1 = buildNote({ id: "note-1", x: 100, y: 100 });
    const note2 = buildNote({ id: "note-2", x: 300, y: 100 });
    const note3 = buildNote({ id: "note-3", x: 500, y: 100 });
    const note4 = buildNote({ id: "note-4", x: 700, y: 100 });

    const groups: PersistentGroup[] = [
      { id: "g1", name: "課題A", noteIds: ["note-1", "note-2"] },
      { id: "g2", name: "課題B", noteIds: ["note-3", "note-4"] },
    ];

    const renderGroups = calculateRenderGroups(
      [note1, note2, note3, note4],
      groups,
    );

    // 入れ子を廃止したので、返ってくるグループ枠は1個であること
    expect(renderGroups).toHaveLength(1);

    const combined = renderGroups[0];
    expect(combined.name).toBe("課題A");
    expect(combined.persistentGroupId).toBe("g1");
    expect(combined.id).toContain("combined-");
  });
});
