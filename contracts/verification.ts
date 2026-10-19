import { z } from "zod";
import { getRoomPhaseLabel, type RoomPhase, RoomPhaseSchema } from "./phase";
import { ROOM_CREATION_NAME_MAX } from "./room-creation";

export const VerificationCheckpointSchema = z.enum([
  "lobby",
  "1-1",
  "1-2",
  "1-3",
  "1-4",
  "1-5",
  "2-1",
  "2-2",
  "2-3",
  "2-4",
  "3-1",
  "3-2",
  "3-3",
  "3-4",
  "3-5",
]);
export type VerificationCheckpoint = z.infer<
  typeof VerificationCheckpointSchema
>;
export const VERIFICATION_CHECKPOINTS: ReadonlyArray<{
  id: VerificationCheckpoint;
  label: string;
  phase: RoomPhase;
}> = VerificationCheckpointSchema.options.map((id) => {
  const [phaseNumber, step] = id.split("-").map(Number);
  const phase = RoomPhaseSchema.parse(
    id === "lobby"
      ? { kind: "lobby" }
      : { kind: "step", phase: phaseNumber, step },
  );
  return { id, label: getRoomPhaseLabel(phase), phase };
});
export const VerificationCreateRequestSchema = z.strictObject({
  checkpoint: VerificationCheckpointSchema,
});
export const VerificationVoteRequestSchema = z.strictObject({
  phase: z.int().min(1).max(3),
  step: z.int().min(1).max(5),
});
export type VerificationVoteRequest = z.infer<
  typeof VerificationVoteRequestSchema
>;
export const VerificationActiveSchema = z.object({
  roomId: z.guid(),
  inviteCode: z.string(),
  checkpoint: VerificationCheckpointSchema,
});
export type VerificationActive = z.infer<typeof VerificationActiveSchema>;
export const VerificationWorkspaceSchema = z.object({
  active: VerificationActiveSchema.nullable(),
});
export const VerificationStatusSchema = z.object({
  phase: RoomPhaseSchema,
  canCompleteVotes: z.boolean(),
  completedOtherVoters: z.int().min(0).max(2),
});
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const VerificationOutcomeScenarioSchema = z.enum([
  "partial",
  "completed",
  "empty",
  "failure",
  "expired",
]);
export type VerificationOutcomeScenario = z.infer<
  typeof VerificationOutcomeScenarioSchema
>;
export const VerificationOutcomeRequestSchema = z.strictObject({
  scenario: VerificationOutcomeScenarioSchema,
  roomName: z.string().trim().max(ROOM_CREATION_NAME_MAX).optional(),
});
export const VerificationOutcomeRecoverySchema = z.object({
  recovered: z.literal(true),
});
