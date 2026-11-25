import { describe, expect, it } from "vitest";
import { getNoteHeight, NOTE_DEFAULT_FONT_SIZE, NOTE_WIDTH } from "./board";
import type { PersistentGroup } from "./grouping";
import { computeRevoteLayout, type RevoteLayoutNote } from "./revote-layout";

const GROUP_PADDING = 16;

type Rect = { x: number; y: number; width: number; height: number };

function noteRect(note: RevoteLayoutNote): Rect {
  return {
    x: note.x,
    y: note.y,
    width: NOTE_WIDTH,
    height: getNoteHeight(note.content, note.fontSize ?? NOTE_DEFAULT_FONT_SIZE),
  };
}

function groupRect(
  group: PersistentGroup,
  notesById: Map<string, RevoteLayoutNote>,
): Rect | null {
  const members = group.noteIds
    .map((id) => notesById.get(id))
    .filter((n): n is RevoteLayoutNote => n !== undefined);
  if (members.length === 0) return null;
  const left = Math.min(...members.map((n) => n.x));
  const top = Math.min(...members.map((n) => n.y));
  const right = Math.max(...members.map((n) => n.x + NOTE_WIDTH));
  const bottom = Math.max(
    ...members.map(
      (n) => n.y + getNoteHeight(n.content, n.fontSize ?? NOTE_DEFAULT_FONT_SIZE),
    ),
  );
  return {
    x: left - GROUP_PADDING,
    y: top - GROUP_PADDING,
    width: right - left + GROUP_PADDING * 2,
    height: bottom - top + GROUP_PADDING * 2,
  };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function applyMoves(
  notes: RevoteLayoutNote[],
  moves: ReturnType<typeof computeRevoteLayout>,
): RevoteLayoutNote[] {
  const moveMap = new Map(moves.map((m) => [m.noteId, m]));
  return notes.map((note) => {
    const move = moveMap.get(note.id);
    return move ? { ...note, x: move.x, y: move.y } : note;
  });
}

function assertValidLayout(
  notes: RevoteLayoutNote[],
  groups: PersistentGroup[],
): void {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const gRects = groups
    .map((g) => ({ group: g, rect: groupRect(g, byId) }))
    .filter((entry): entry is { group: PersistentGroup; rect: Rect } =>
      Boolean(entry.rect),
    );

  // 条件1: グループ枠同士が重ならない
  for (let i = 0; i < gRects.length; i++) {
    for (let j = i + 1; j < gRects.length; j++) {
      expect(
        rectsOverlap(gRects[i].rect, gRects[j].rect),
        `グループ ${gRects[i].group.id} と ${gRects[j].group.id} が重なっている`,
      ).toBe(false);
    }
  }

  // 条件2: どの付箋も自分が属していないグループ枠に入らない
  for (const note of notes) {
    const nRect = noteRect(note);
    for (const { group, rect } of gRects) {
      if (group.noteIds.includes(note.id)) continue;
      expect(
        rectsOverlap(nRect, rect),
        `付箋 ${note.id} が非所属グループ ${group.id} の枠と重なっている`,
      ).toBe(false);
    }
  }
}

function makeNote(id: string, x: number, y: number): RevoteLayoutNote {
  return { id, x, y, content: `付箋 ${id}`, fontSize: 16 };
}

describe("computeRevoteLayout（再投票移行時の自動レイアウト調整）", () => {
  it("重なりも非所属付箋の侵入もなければ、1枚も座標を変更しない", () => {
    const notes = [
      makeNote("a1", 0, 0),
      makeNote("a2", 220, 0),
      makeNote("b1", 600, 0),
      makeNote("b2", 820, 0),
      makeNote("solo", 0, 300),
    ];
    const groups: PersistentGroup[] = [
      { id: "gA", name: "グループ A", noteIds: ["a1", "a2"] },
      { id: "gB", name: "グループ B", noteIds: ["b1", "b2"] },
    ];

    const moves = computeRevoteLayout(notes, groups);
    expect(moves).toEqual([]);
  });

  it("パターン①: グループから飛び出した付箋だけを引き戻して枠の重なりを解消し、他の付箋は動かさない", () => {
    // A: a1, a2 は左にまとまっているが、a3 だけ右へ大きく動かされ、B枠(x=500..920)を越えてx=1000にある
    const notes = [
      makeNote("a1", 0, 0),
      makeNote("a2", 220, 0),
      makeNote("a3", 1000, 0),
      makeNote("b1", 520, 0),
      makeNote("b2", 740, 0),
    ];
    const groups: PersistentGroup[] = [
      { id: "gA", name: "グループ A", noteIds: ["a1", "a2", "a3"] },
      { id: "gB", name: "グループ B", noteIds: ["b1", "b2"] },
    ];

    const moves = computeRevoteLayout(notes, groups);
    const updated = applyMoves(notes, moves);

    assertValidLayout(updated, groups);
    // 動いたのは飛び出した a3 のみで、a1, a2, b1, b2 は動かない
    expect(moves.map((m) => m.noteId)).toEqual(["a3"]);
  });

  it("パターン②: グループ内がまとまったまま枠の端同士が重なる場合は、グループ全体の相対配置を保って平行移動する", () => {
    // A(x=0..420) と B(x=400..820) が少し重なっている（グループ内はそれぞれ密）
    const notes = [
      makeNote("a1", 0, 0),
      makeNote("a2", 220, 0),
      makeNote("b1", 400, 0),
      makeNote("b2", 620, 0),
    ];
    const groups: PersistentGroup[] = [
      { id: "gA", name: "グループ A", noteIds: ["a1", "a2"] },
      { id: "gB", name: "グループ B", noteIds: ["b1", "b2"] },
    ];

    const moves = computeRevoteLayout(notes, groups);
    const updated = applyMoves(notes, moves);

    assertValidLayout(updated, groups);
    expect(moves.length).toBeGreaterThan(0);

    // グループ内の相対位置が維持されていること
    const byId = new Map(updated.map((n) => [n.id, n]));
    const a1 = byId.get("a1")!;
    const a2 = byId.get("a2")!;
    const b1 = byId.get("b1")!;
    const b2 = byId.get("b2")!;
    expect(a2.x - a1.x).toBe(220);
    expect(a2.y - a1.y).toBe(0);
    expect(b2.x - b1.x).toBe(220);
    expect(b2.y - b1.y).toBe(0);
  });

  it("パターン③: グループ枠内に入り込んだ無所属の付箋だけを枠の外へ退避させ、グループ内付箋は動かさない", () => {
    // A枠は x=-16..436, y=-16..166 付近。その間の (110, 20) に無所属 solo が入っている
    const notes = [
      makeNote("a1", 0, 0),
      makeNote("a2", 220, 0),
      makeNote("solo", 110, 20),
    ];
    const groups: PersistentGroup[] = [
      { id: "gA", name: "グループ A", noteIds: ["a1", "a2"] },
    ];

    const moves = computeRevoteLayout(notes, groups);
    const updated = applyMoves(notes, moves);

    assertValidLayout(updated, groups);
    expect(moves.map((m) => m.noteId)).toEqual(["solo"]);
  });

  it("複数の重なりパターンが複合しても、最終的に全グループの枠非交差と非所属付箋の非侵入を満たす", () => {
    const notes = [
      makeNote("a1", 0, 0),
      makeNote("a2", 220, 0),
      makeNote("a3", 900, 10),
      makeNote("b1", 380, 10),
      makeNote("b2", 600, 10),
      makeNote("solo1", 100, 30),
      makeNote("solo2", 480, 20),
    ];
    const groups: PersistentGroup[] = [
      { id: "gA", name: "グループ A", noteIds: ["a1", "a2", "a3"] },
      { id: "gB", name: "グループ B", noteIds: ["b1", "b2"] },
    ];

    const moves = computeRevoteLayout(notes, groups);
    const updated = applyMoves(notes, moves);

    assertValidLayout(updated, groups);
  });
});
