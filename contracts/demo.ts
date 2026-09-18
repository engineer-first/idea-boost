import { z } from "zod";
import { RoomPhaseSchema, type RoomStepPhase } from "./phase";

export const DemoCheckpointSchema = z.enum([
  "start",
  "share",
  "grouping",
  "vote",
  "problem-decision",
  "hmw",
  "hmw-share",
  "hmw-vote",
  "hmw-decision",
  "ideation",
  "idea-share",
  "ideas",
  "idea-vote",
  "complete",
]);
export type DemoCheckpoint = z.infer<typeof DemoCheckpointSchema>;
export const DEMO_CHECKPOINT_PHASES: Record<DemoCheckpoint, RoomStepPhase> = {
  start: { kind: "step", phase: 1, step: 1 },
  share: { kind: "step", phase: 1, step: 2 },
  grouping: { kind: "step", phase: 1, step: 3 },
  vote: { kind: "step", phase: 1, step: 4 },
  "problem-decision": { kind: "step", phase: 1, step: 5 },
  hmw: { kind: "step", phase: 2, step: 1 },
  "hmw-share": { kind: "step", phase: 2, step: 2 },
  "hmw-vote": { kind: "step", phase: 2, step: 3 },
  "hmw-decision": { kind: "step", phase: 2, step: 4 },
  ideation: { kind: "step", phase: 3, step: 1 },
  "idea-share": { kind: "step", phase: 3, step: 2 },
  ideas: { kind: "step", phase: 3, step: 3 },
  "idea-vote": { kind: "step", phase: 3, step: 4 },
  complete: { kind: "step", phase: 3, step: 5 },
};
export const DemoActionSchema = z.enum(["share", "group", "vote"]);
export type DemoAction = z.infer<typeof DemoActionSchema>;
export const DemoCreateRequestSchema = z
  .object({ checkpoint: DemoCheckpointSchema })
  .strict();
export const DemoActionRequestSchema = z
  .object({
    action: DemoActionSchema,
    phase: z.number().int().min(1).max(3),
    step: z.number().int().min(1).max(5),
  })
  .strict();
export type DemoActionRequest = z.infer<typeof DemoActionRequestSchema>;
export const DemoCreateResponseSchema = z.object({
  roomId: z.string().uuid(),
  inviteCode: z.string(),
});
export const DemoStatusSchema = z.object({
  checkpoint: DemoCheckpointSchema,
  phase: RoomPhaseSchema,
  availableActions: z.array(DemoActionSchema),
  sharedCount: z.number().int().min(0).max(4),
  votedCount: z.number().int().min(0).max(4),
});
export type DemoStatus = z.infer<typeof DemoStatusSchema>;
export const DEMO_HOST = {
  sub: "d0000000-0000-4000-8000-000000000001",
  email: "host@demo.example.test",
  name: "デモホスト",
} as const;
