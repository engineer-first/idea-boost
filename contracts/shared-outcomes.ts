import { z } from "zod";
import { RoomPhaseSchema } from "./phase";
import { NoteColorSchema } from "./room-protocol";
export const SharedOutcomeNoteSchema = z.object({
  id: z.string(),
  content: z.string(),
  phase: z.number().int().min(1).max(3),
  x: z.number(),
  y: z.number(),
  color: NoteColorSchema,
  fontSize: z.number(),
  stackOrder: z.number(),
  excluded: z.boolean(),
  votes: z.object({ subjective: z.number(), objective: z.number() }).nullable(),
});
export const SharedOutcomeSnapshotSchema = z.object({
  capturedAt: z.number(),
  phase: RoomPhaseSchema,
  decisions: z.array(
    z.object({
      phase: z.number(),
      noteId: z.string(),
      content: z.string(),
      votes: z.object({ subjective: z.number(), objective: z.number() }),
    }),
  ),
  notes: z.array(SharedOutcomeNoteSchema),
  groups: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      noteIds: z.array(z.string()),
    }),
  ),
  ideaMapSizeLevel: z.number(),
});
export const SharedOutcomeSummarySchema = z.object({
  roomId: z.string().uuid(),
  name: z.string().nullable(),
  displayId: z.string(),
  lastUsedAt: z.number(),
  expiresAt: z.number(),
  phase: RoomPhaseSchema,
  status: z.enum(["partial", "confirmed"]),
  saveStatus: z.enum(["saved", "pending", "failed"]),
  lastSavedAt: z.number().nullable(),
});
export const SharedOutcomeRecordSchema = SharedOutcomeSummarySchema.extend({
  snapshot: SharedOutcomeSnapshotSchema.nullable(),
});
export const SharedOutcomesResponseSchema = z.object({
  outcomes: z.array(SharedOutcomeSummarySchema),
  nextCursor: z.string().nullable(),
});
export type SharedOutcomeNote = z.infer<typeof SharedOutcomeNoteSchema>;
export type SharedOutcomeSnapshot = z.infer<typeof SharedOutcomeSnapshotSchema>;
export type SharedOutcomeSummary = z.infer<typeof SharedOutcomeSummarySchema>;
export type SharedOutcomeRecord = z.infer<typeof SharedOutcomeRecordSchema>;
export type SharedOutcomesResponse = z.infer<
  typeof SharedOutcomesResponseSchema
>;
export const SHARED_OUTCOME_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const ProgressHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().positive(),
  phase: RoomPhaseSchema,
  nextPhase: RoomPhaseSchema.nullable(),
  action: z.enum(["next", "restart-writing", "revote", "complete"]).nullable(),
  enteredAt: z.number().nullable(),
  exitedAt: z.number().nullable(),
  saveStatus: z.enum(["saved", "pending", "failed", "missing", "open"]),
  reflectedAt: z.number().nullable(),
});
export const ProgressHistoryResponseSchema = z.object({
  entries: z.array(ProgressHistoryEntrySchema),
  nextCursor: z.string().nullable(),
});
export const ProgressHistoryRecordSchema = ProgressHistoryEntrySchema.extend({
  snapshot: SharedOutcomeSnapshotSchema.nullable(),
});
export type ProgressHistoryEntry = z.infer<typeof ProgressHistoryEntrySchema>;
export type ProgressHistoryResponse = z.infer<
  typeof ProgressHistoryResponseSchema
>;
export type ProgressHistoryRecord = z.infer<typeof ProgressHistoryRecordSchema>;

const OutcomeDateSchema = z.string().refine((value) => {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000"))
    return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}, "実在する日付を指定してください。");
export const SharedOutcomeFiltersSchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    status: z.enum(["all", "partial", "confirmed"]).default("all"),
    phase: z.enum(["all", "lobby", "1", "2", "3"]).default("all"),
    saveStatus: z.enum(["all", "saved", "pending", "failed"]).default("all"),
    from: OutcomeDateSchema.default(""),
    to: OutcomeDateSchema.default(""),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: "終了日は開始日以降にしてください。",
    path: ["to"],
  });
export const SharedOutcomeCursorSchema = z
  .string()
  .max(90)
  .refine((value) => {
    const [position, id, extra] = value.split(":");
    return (
      /^\d+$/.test(position) &&
      Number.isSafeInteger(Number(position)) &&
      extra === undefined &&
      (id === undefined || z.string().uuid().safeParse(id).success)
    );
  });
export const SharedOutcomesQuerySchema = SharedOutcomeFiltersSchema.and(
  z.object({
    cursor: SharedOutcomeCursorSchema.optional(),
  }),
);
export type SharedOutcomeFilters = z.infer<typeof SharedOutcomeFiltersSchema>;
