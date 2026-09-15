import { z } from "zod";
import { RoomPhaseSchema } from "./phase";

export const DemoCheckpointSchema = z.enum([
  "start",
  "share",
  "vote",
  "ideas",
  "complete",
]);
export type DemoCheckpoint = z.infer<typeof DemoCheckpointSchema>;
export const DemoActionSchema = z.enum(["share", "vote"]);
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
