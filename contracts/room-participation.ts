import { z } from "zod";
import { CreateRoomInputSchema } from "./api";
export const ParticipationTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("join"), code: z.string().length(6) }),
  z.strictObject({ kind: z.literal("create"), input: CreateRoomInputSchema }),
  z.strictObject({ kind: z.literal("revisit"), roomId: z.guid() }),
]);
export type ParticipationTarget = z.infer<typeof ParticipationTargetSchema>;
export const ParticipationSourceSchema = z.object({
  roomId: z.guid(),
  name: z.string(),
  inviteCode: z.string(),
  hostRevision: z.int(),
  hostUserId: z.string().nullable(),
  action: z.enum(["leave", "transfer", "disband"]),
  successor: z.object({ userId: z.string(), name: z.string() }).nullable(),
});
export type ParticipationSource = z.infer<typeof ParticipationSourceSchema>;
export const ParticipationConfirmationSchema = z.object({
  operationId: z.guid(),
  version: z.int().nonnegative(),
  target: ParticipationTargetSchema,
  targetName: z.string(),
  progress: z.enum(["confirming", "partially_left"]).optional(),
  outcomeAccess: z.enum(["retain", "discard"]).optional(),
  sources: z.array(ParticipationSourceSchema),
});
export type ParticipationConfirmation = z.infer<
  typeof ParticipationConfirmationSchema
>;
export const ParticipationPrepareSchema = z.strictObject({
  target: ParticipationTargetSchema,
  expectedPrincipal: z.guid(),
});
export const ParticipationCommitSchema = z.strictObject({
  operationId: z.guid(),
  outcomeAccess: z.enum(["retain", "discard"]).default("discard"),
  confirmationVersion: z.int().nonnegative(),
  expectedPrincipal: z.guid(),
});
export const PARTICIPATION_RESERVATION_MS = 120_000;
export const ParticipationFailureContextSchema = z.object({
  operationId: z.guid(),
  exitedSources: z.array(
    z.object({
      roomId: z.guid(),
      name: z.string(),
      result: z.enum(["left", "disbanded", "inactive"]),
    }),
  ),
  remainingSources: z.array(ParticipationSourceSchema),
  currentRoomId: z.guid().optional(),
});
export type ParticipationFailureContext = z.infer<
  typeof ParticipationFailureContextSchema
>;
export const ParticipationResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("confirmation"),
    confirmation: ParticipationConfirmationSchema,
    reason: z.string().optional(),
  }),
  z.object({
    kind: z.literal("ready"),
    roomId: z.guid(),
    inviteCode: z.string().optional(),
  }),
  z.object({
    kind: z.literal("pending"),
    operationId: z.guid(),
    progress: z.enum(["leaving", "joining"]),
    target: ParticipationTargetSchema.optional(),
    targetName: z.string().optional(),
    error: z.string(),
  }),
  z.object({
    kind: z.literal("rejected"),
    reason: z.string(),
    error: z.string(),
    failure: ParticipationFailureContextSchema.optional(),
  }),
]);
export type ParticipationResult = z.infer<typeof ParticipationResultSchema>;
