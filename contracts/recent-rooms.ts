import { z } from "zod";

/** ホームに出す、本人が最近参加したルームの件数の上限。 */
export const RECENT_ROOMS_LIMIT = 3;

// 本人が在籍中か成果を閲覧できるルームだけを返す。招待コードや他の参加者は含めない。
export const RecentRoomSchema = z.strictObject({
  roomId: z.guid(),
  /** 進行中はルーム名、完了は決まったアイデア。 */
  label: z.string(),
  status: z.enum(["active", "completed"]),
  completedAt: z.number().optional(),
  /** ルームを作った日時（epoch ms）。古い記録で分からなければ省く。 */
  createdAt: z.number().optional(),
  /** 成果が自動削除される日時（epoch ms）。進行中は最後の利用から、完了は初回の完了から数える。分からなければ省く。 */
  expiresAt: z.number().optional(),
});
export type RecentRoom = z.infer<typeof RecentRoomSchema>;

export const RecentRoomsResponseSchema = z.strictObject({
  rooms: z.array(RecentRoomSchema).max(RECENT_ROOMS_LIMIT),
});
export type RecentRoomsResponse = z.infer<typeof RecentRoomsResponseSchema>;
