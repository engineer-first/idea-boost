import { z } from "zod";
import { NoteColorSchema } from "./room-protocol";

export const CompletedSceneKindSchema = z.enum([
  "problem-grouping",
  "problem-decision",
  "question-decision",
  "idea-mapping",
  "idea-decision",
]);
export type CompletedSceneKind = z.infer<typeof CompletedSceneKindSchema>;
export const CompletedDecisionSchema = z.object({
  phase: z.number().int().min(1).max(3),
  noteId: z.string(),
  content: z.string(),
});
export const CompletedSceneSchema = z.object({
  kind: CompletedSceneKindSchema,
  recordedAt: z.number().nullable(),
  status: z.enum(["saved", "pending", "failed", "missing", "before-recording"]),
});
export const CompletedRoomSummarySchema = z.object({
  roomId: z.guid(),
  idea: z.string(),
  completedAt: z.number(),
  expiresAt: z.number(),
});
export const CompletedRoomSchema = CompletedRoomSummarySchema.extend({
  decisions: z
    .array(CompletedDecisionSchema)
    .length(3)
    .refine(
      (decisions) =>
        [1, 2, 3].every((phase) =>
          decisions.some((decision) => decision.phase === phase),
        ),
      "3フェーズの確定内容が必要です。",
    ),
  scenes: z.array(CompletedSceneSchema).length(5),
});
export const CompletedRoomsResponseSchema = z.object({
  rooms: z.array(CompletedRoomSummarySchema),
  nextCursor: z.string().nullable(),
});
export const CompletedBoardSchema = z.object({
  kind: CompletedSceneKindSchema,
  recordedAt: z.number(),
  phase: z.number().int().min(1).max(3),
  notes: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      x: z.number(),
      y: z.number(),
      color: NoteColorSchema,
      fontSize: z.number(),
      stackOrder: z.number(),
      excluded: z.boolean(),
    }),
  ),
  groups: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      noteIds: z.array(z.string()),
    }),
  ),
  ideaMapSizeLevel: z.number(),
  decisions: z.array(CompletedDecisionSchema),
});
export type CompletedRoomSummary = z.infer<typeof CompletedRoomSummarySchema>;
export type CompletedRoom = z.infer<typeof CompletedRoomSchema>;
export type CompletedRoomsResponse = z.infer<
  typeof CompletedRoomsResponseSchema
>;
export type CompletedScene = z.infer<typeof CompletedSceneSchema>;
export type CompletedBoard = z.infer<typeof CompletedBoardSchema>;
export const CompletedBoardResponseSchema = z.object({
  scene: CompletedSceneSchema,
  board: CompletedBoardSchema.nullable(),
});
export type CompletedBoardResponse = z.infer<
  typeof CompletedBoardResponseSchema
>;
export const CompletedRoomsCursorSchema = z.object({
  completedAt: z.number().int().nonnegative(),
  roomId: z.guid(),
});
export const LeaveRoomRequestSchema = z.object({
  intent: z.enum(["self", "disband"]).optional(),
  expectedHostRevision: z.number().int().nonnegative().optional(),
});
