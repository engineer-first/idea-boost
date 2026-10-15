import { z } from "zod";
import { CreateRoomInputSchema } from "./api";
export const ParticipationTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("join"), code: z.string().length(6) }).strict(),
  z
    .object({ kind: z.literal("create"), input: CreateRoomInputSchema })
    .strict(),
  z.object({ kind: z.literal("revisit"), roomId: z.string().uuid() }).strict(),
]);
export type ParticipationTarget = z.infer<typeof ParticipationTargetSchema>;
export const ParticipationSourceSchema = z.object({
  roomId: z.string().uuid(),
  name: z.string(),
  inviteCode: z.string(),
  hostRevision: z.number().int(),
  hostUserId: z.string().nullable(),
  action: z.enum(["leave", "transfer", "disband"]),
  successor: z.object({ userId: z.string(), name: z.string() }).nullable(),
});
export type ParticipationSource = z.infer<typeof ParticipationSourceSchema>;
export const ParticipationConfirmationSchema = z.object({
  operationId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  target: ParticipationTargetSchema,
  targetName: z.string(),
  progress: z.enum(["confirming", "partially_left"]).optional(),
  outcomeAccess: z.enum(["retain", "discard"]).optional(),
  sources: z.array(ParticipationSourceSchema),
});
export type ParticipationConfirmation = z.infer<
  typeof ParticipationConfirmationSchema
>;
export const ParticipationPrepareSchema = z
  .object({
    target: ParticipationTargetSchema,
    expectedPrincipal: z.string().uuid(),
  })
  .strict();
export const ParticipationCommitSchema = z
  .object({
    operationId: z.string().uuid(),
    outcomeAccess: z.enum(["retain", "discard"]).default("discard"),
    confirmationVersion: z.number().int().nonnegative(),
    expectedPrincipal: z.string().uuid(),
  })
  .strict();
export const PARTICIPATION_RESERVATION_MS = 120_000;
export const ParticipationFailureContextSchema = z.object({
  operationId: z.string().uuid(),
  exitedSources: z.array(
    z.object({
      roomId: z.string().uuid(),
      name: z.string(),
      result: z.enum(["left", "disbanded", "inactive"]),
    }),
  ),
  remainingSources: z.array(ParticipationSourceSchema),
  currentRoomId: z.string().uuid().optional(),
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
    roomId: z.string().uuid(),
    inviteCode: z.string().optional(),
  }),
  z.object({
    kind: z.literal("pending"),
    operationId: z.string().uuid(),
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
