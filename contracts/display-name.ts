import { z } from "zod";
import { RoomDisplayNameSchema } from "./room-protocol";

// 認証プロフィール名とは独立した、本人が選んだ表示名。
const LEGACY_DISPLAY_NAME_MAX_LENGTH = 40;
export const DisplayNameResponseSchema = z.object({
  // 旧上限で保存した表示名は、編集するまでそのまま読める。
  name: z.string().trim().min(1).max(LEGACY_DISPLAY_NAME_MAX_LENGTH).nullable(),
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
