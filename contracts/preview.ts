import { z } from "zod";

export const PreviewCheckpointSchema = z.enum([
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
export type PreviewCheckpoint = z.infer<typeof PreviewCheckpointSchema>;
export const PreviewCreateRequestSchema = z
  .object({ checkpoint: PreviewCheckpointSchema })
  .strict();
export const PreviewRoomSchema = z.object({
  roomId: z.string().uuid(),
  inviteCode: z.string().min(1),
  checkpoint: PreviewCheckpointSchema,
});
export type PreviewRoom = z.infer<typeof PreviewRoomSchema>;

export const PreviewAccessClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  exp: z.number().int().positive(),
});
export type PreviewAccessClaims = z.infer<typeof PreviewAccessClaimsSchema>;
