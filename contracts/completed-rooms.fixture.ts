import {
  type CompletedBoard,
  type CompletedRoom,
  CompletedRoomSchema,
} from "./completed-rooms";
export function completedRoomFixture(
  overrides: Partial<CompletedRoom> = {},
): CompletedRoom {
  return CompletedRoomSchema.parse({
    roomId: "11111111-1111-4111-8111-111111111111",
    idea: "空きコマに学び合う仲間と出会える勉強マッチ",
    completedAt: 1790683200000,
    expiresAt: 1793275200000,
    decisions: [
      {
        phase: 1,
        noteId: "problem",
        content: "空きコマに一緒に勉強する仲間が見つからない",
      },
      {
        phase: 2,
        noteId: "question",
        content: "どうすれば気軽に学び合う仲間と出会えるだろう？",
      },
      {
        phase: 3,
        noteId: "idea",
        content: "空きコマに学び合う仲間と出会える勉強マッチ",
      },
    ],
    scenes: [
      "problem-grouping",
      "problem-decision",
      "question-decision",
      "idea-mapping",
      "idea-decision",
    ].map((kind) => ({ kind, recordedAt: 1790683000000, status: "saved" })),
    ...overrides,
  });
}
export function completedBoardFixture(
  overrides: Partial<CompletedBoard> = {},
): CompletedBoard {
  return {
    kind: "problem-grouping",
    recordedAt: 1790683000000,
    phase: 1,
    notes: [
      {
        id: "problem",
        content: "空きコマに一緒に勉強する仲間が見つからない",
        x: 30,
        y: 40,
        color: "yellow",
        fontSize: 16,
        stackOrder: 0,
        excluded: false,
      },
      {
        id: "other",
        content: "声をかけるきっかけがない",
        x: 280,
        y: 80,
        color: "blue",
        fontSize: 16,
        stackOrder: 1,
        excluded: false,
      },
    ],
    groups: [
      {
        id: "group",
        name: "つながりのきっかけ",
        noteIds: ["problem", "other"],
      },
    ],
    ideaMapSizeLevel: 0,
    decisions: [],
    ...overrides,
  };
}
export function completedSceneBoardFixture(
  kind: CompletedBoard["kind"],
): CompletedBoard {
  const phase = kind.startsWith("problem")
    ? 1
    : kind.startsWith("question")
      ? 2
      : 3;
  const room = completedRoomFixture();
  const decision = room.decisions.find((d) => d.phase === phase);
  return completedBoardFixture({
    kind,
    phase,
    groups: phase === 1 ? completedBoardFixture().groups : [],
    notes: completedBoardFixture().notes.map((note, index) => ({
      ...note,
      id: index === 0 && decision ? decision.noteId : note.id,
      content: index === 0 && decision ? decision.content : note.content,
      x: phase === 3 ? 25 + index * 40 : note.x,
      y: phase === 3 ? 70 - index * 30 : note.y,
    })),
    decisions: kind.endsWith("decision") && decision ? [decision] : [],
  });
}
