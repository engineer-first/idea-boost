import {
  type SharedOutcomeRecord,
  SharedOutcomeRecordSchema,
} from "./shared-outcomes";
export function buildSharedOutcome(
  overrides: Partial<SharedOutcomeRecord> = {},
): SharedOutcomeRecord {
  const timestamp = Date.UTC(2026, 8, 27, 10);
  return SharedOutcomeRecordSchema.parse({
    roomId: "123e4567-e89b-42d3-a456-426614174000",
    name: "相談ルーム",
    displayId: "R-4829A1",
    lastUsedAt: timestamp,
    expiresAt: timestamp + 30 * 86400000,
    phase: { kind: "step", phase: 3, step: 3 },
    status: "partial",
    saveStatus: "saved",
    lastSavedAt: timestamp,
    snapshot: {
      capturedAt: timestamp,
      phase: { kind: "step", phase: 3, step: 3 },
      decisions: [
        {
          phase: 1,
          noteId: "n1",
          content: "待ち時間を減らす",
          votes: { subjective: 2, objective: 1 },
        },
        {
          phase: 2,
          noteId: "n2",
          content: "どうすれば受付を楽しめるだろうか",
          votes: { subjective: 1, objective: 2 },
        },
      ],
      notes: [
        {
          id: "n1",
          content: "待ち時間を減らす",
          phase: 1,
          x: 80,
          y: 100,
          color: "yellow",
          fontSize: 14,
          stackOrder: 0,
          excluded: false,
          votes: null,
        },
        {
          id: "n3",
          content: "予約状況を表示する",
          phase: 3,
          x: 70,
          y: 80,
          color: "blue",
          fontSize: 14,
          stackOrder: 0,
          excluded: true,
          votes: null,
        },
      ],
      groups: [{ id: "g1", name: "受付の改善", noteIds: ["n1"] }],
      ideaMapSizeLevel: 0,
    },
    ...overrides,
  });
}
