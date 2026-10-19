import { z } from "zod";
import { RoomDisplayNameSchema } from "./room-protocol";

// 認証プロフィール名とは独立した、本人が選んだ表示名。
export const DisplayNameResponseSchema = z.object({
  // Googleの初期名と旧保存値は、新規入力の15文字上限と独立して読める。
  name: z.string().trim().min(1).nullable(),
});
export type DisplayNameResponse = z.infer<typeof DisplayNameResponseSchema>;
export const SetDisplayNameInputSchema = z.strictObject({
  expectedPrincipal: z.guid(),
  name: RoomDisplayNameSchema,
  // ルーム内から変更した場合だけ、その在籍先にも反映する。
  roomId: z.guid().optional(),
});
export type SetDisplayNameInput = z.infer<typeof SetDisplayNameInputSchema>;

export function defaultDisplayName(userId: string): string {
  return `参加者 ${userId.slice(0, 6).toUpperCase()}`;
}
