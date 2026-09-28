import { z } from "zod";
import { getRoomPhaseLabel, type RoomPhase, RoomPhaseSchema } from "./phase";

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
export const VerificationCreateRequestSchema = z
  .object({ checkpoint: VerificationCheckpointSchema })
  .strict();
export const VerificationVoteRequestSchema = z
  .object({
    phase: z.number().int().min(1).max(3),
    step: z.number().int().min(1).max(5),
  })
  .strict();
export type VerificationVoteRequest = z.infer<
  typeof VerificationVoteRequestSchema
>;
export const VerificationActiveSchema = z.object({
  roomId: z.string().uuid(),
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
  completedOtherVoters: z.number().int().min(0).max(2),
});
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
