// visibleTo のテーブル駆動テスト。
// フェーズ・ロールの分岐を visibility.ts に追加するときは、このテーブルに
// 必ず対応する行を足す（分岐がテーブルにないままのマージはレビューで差し戻す）。
import { describe, expect, it } from "vitest";
import { buildPhaseStep } from "../contracts/phase.fixture";
import type { ProtocolNote } from "../contracts/room-protocol";
import { filterVisible, projectNoteForViewer, visibleTo } from "./visibility";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const VIEWER = "22222222-2222-4222-8222-222222222222";

function note(overrides?: Partial<ProtocolNote>): ProtocolNote {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    authorId: AUTHOR,
    content: "メモ",
    contentRevision: 0,
    visibility: "shared",
    excluded: false,
    color: "yellow",
    x: 100,
    y: 100,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    dotVotes: {
      subjective: { count: 0, votedByMe: false, ownCount: 0 },
      objective: { count: 0, votedByMe: false, ownCount: 0 },
    },
    ...overrides,
    fontSize: overrides?.fontSize ?? 14,
    stackOrder: overrides?.stackOrder ?? 0,
    dotVoteStickers: overrides?.dotVoteStickers ?? [],
  };
}

// フェーズ概念の導入時に { phase, viewer, note作者, expected } の形へ拡張する。
const TABLE: Array<{
  name: string;
  viewerId: string;
  note: ProtocolNote;
  expected: boolean;
}> = [
  {
    name: "private: 作者本人は自分の付箋を見られる",
    viewerId: AUTHOR,
    note: note({ visibility: "private" }),
    expected: true,
  },
  {
    name: "private: 他のメンバーは付箋を見られない",
    viewerId: VIEWER,
    note: note({ visibility: "private" }),
    expected: false,
  },
  {
    name: "共有の進行役でも他者のprivate付箋は見られない",
    viewerId: VIEWER,
    note: note({ visibility: "private" }),
    expected: false,
  },
  {
    name: "shared: 他のメンバーも付箋を見られる",
    viewerId: VIEWER,
    note: note({ visibility: "shared" }),
    expected: true,
  },
];

describe("visibleTo", () => {
  for (const row of TABLE) {
    it(row.name, () => {
      expect(visibleTo({ viewerId: row.viewerId }, row.note)).toBe(
        row.expected,
      );
    });
  }
});

describe("filterVisible", () => {
  it("visibleTo の判定でスナップショットを絞り込む", () => {
    const notes = [note({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })];
    expect(filterVisible({ viewerId: VIEWER }, notes)).toEqual(notes);
  });
});

describe("projectNoteForViewer", () => {
  it.each([
    ["step 1-1", buildPhaseStep(1)],
    ["step 1-2", buildPhaseStep(2)],
    ["step 1-5", buildPhaseStep(5)],
    ["step 2-1 再執筆", buildPhaseStep(1, 2)],
    ["step 2-4 決定", buildPhaseStep(4, 2)],
    ["step 3-1 再執筆", buildPhaseStep(1, 3)],
    ["step 3-5 決定", buildPhaseStep(5, 3)],
  ])("%s では投票集計を保持する", (_name, phase) => {
    const source = note({
      dotVotes: {
        subjective: { count: 2, votedByMe: true, ownCount: 1 },
        objective: { count: 4, votedByMe: false, ownCount: 0 },
      },
    });

    expect(projectNoteForViewer({ viewerId: VIEWER, phase }, source)).toEqual(
      source,
    );
  });

  it.each([
    buildPhaseStep(4),
    buildPhaseStep(3, 2),
    buildPhaseStep(4, 3),
  ])("初回・再投票ステップ %j では集計を除去し本人票だけを保持する", (phase) => {
    const source = note({
      dotVotes: {
        subjective: { count: 2, votedByMe: true, ownCount: 1 },
        objective: { count: 4, votedByMe: false, ownCount: 0 },
      },
    });

    const projected = projectNoteForViewer({ viewerId: VIEWER, phase }, source);

    expect(projected.dotVotes).toEqual({
      subjective: { votedByMe: true, ownCount: 1 },
      objective: { votedByMe: false, ownCount: 0 },
    });
    expect(source.dotVotes.subjective.count).toBe(2);
    expect(source.dotVotes.objective.count).toBe(4);
  });
});
