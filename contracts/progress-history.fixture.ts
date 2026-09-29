import {
  type ProgressHistoryRecord,
  ProgressHistoryRecordSchema,
} from "./shared-outcomes";
import { buildSharedOutcome } from "./shared-outcomes.fixture";
export function buildProgressHistoryRecord(
  overrides: Partial<ProgressHistoryRecord> = {},
): ProgressHistoryRecord {
  const outcome = buildSharedOutcome();
  if (!outcome.snapshot) throw new Error("fixture snapshot required");
  return ProgressHistoryRecordSchema.parse({
    id: "123e4567-e89b-42d3-a456-426614174011",
    sequence: 1,
    phase: { kind: "step", phase: 1, step: 5 },
    nextPhase: { kind: "step", phase: 1, step: 4 },
    action: "revote",
    enteredAt: outcome.lastUsedAt - 240000,
    exitedAt: outcome.lastUsedAt,
    saveStatus: "saved",
    reflectedAt: outcome.lastUsedAt + 1000,
    snapshot: {
      ...outcome.snapshot,
      phase: { kind: "step", phase: 1, step: 5 },
      decisions: [],
      notes: [
        {
          ...outcome.snapshot.notes[0],
          votes: { subjective: 2, objective: 3 },
        },
        {
          ...outcome.snapshot.notes[0],
          id: "n4",
          content: "受付の案内を分かりやすくする",
          x: 300,
          y: 100,
          color: "pink",
          stackOrder: 1,
          votes: { subjective: 1, objective: 2 },
        },
      ],
      groups: [{ id: "g1", name: "受付の改善", noteIds: ["n1", "n4"] }],
    },
    ...overrides,
  });
}

export function buildIdeaMapHistoryRecord(): ProgressHistoryRecord {
  const outcome = buildSharedOutcome();
  if (!outcome.snapshot) throw new Error("fixture snapshot required");
  return buildProgressHistoryRecord({
    phase: { kind: "step", phase: 3, step: 3 },
    nextPhase: { kind: "step", phase: 3, step: 4 },
    action: "next",
    snapshot: {
      ...outcome.snapshot,
      phase: { kind: "step", phase: 3, step: 3 },
      ideaMapSizeLevel: 2,
      notes: [
        {
          ...outcome.snapshot.notes[0],
          votes: { subjective: 2, objective: 1 },
        },
        {
          ...outcome.snapshot.notes[0],
          id: "n2",
          phase: 2,
          content: "どうすれば受付を楽しめるだろうか",
          votes: { subjective: 1, objective: 2 },
        },
        { ...outcome.snapshot.notes[1], excluded: false, votes: null },
        {
          ...outcome.snapshot.notes[1],
          id: "n5",
          content: "待ち時間に相談内容を入力できるようにする",
          x: 35,
          y: 60,
          color: "green",
          stackOrder: 1,
          excluded: false,
          votes: null,
        },
      ],
    },
  });
}
