import { z } from "zod";
import { RoomDisplayNameSchema } from "./room-protocol";

// 認証プロフィール名とは独立した、本人が選んだ呼び名。
export const DisplayNameResponseSchema = z.object({
  name: RoomDisplayNameSchema.nullable(),
});
export type DisplayNameResponse = z.infer<typeof DisplayNameResponseSchema>;
export const SetDisplayNameInputSchema = z
  .object({
    expectedPrincipal: z.string().uuid(),
    name: RoomDisplayNameSchema,
  })
  .strict();
export type SetDisplayNameInput = z.infer<typeof SetDisplayNameInputSchema>;

export function defaultDisplayName(userId: string): string {
  return `参加者 ${userId.slice(0, 6).toUpperCase()}`;
}
