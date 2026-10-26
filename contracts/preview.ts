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
export const PreviewCreateRequestSchema = z.strictObject({
  checkpoint: PreviewCheckpointSchema,
});
export const PreviewRoomSchema = z.object({
  roomId: z.guid(),
  inviteCode: z.string().min(1),
  checkpoint: PreviewCheckpointSchema,
});
export type PreviewRoom = z.infer<typeof PreviewRoomSchema>;

export const PreviewAccessClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  exp: z.int().positive(),
});
export type PreviewAccessClaims = z.infer<typeof PreviewAccessClaimsSchema>;

// Previewでだけ使う、Access本人のまま未ログイン画面を確認する入口。
// Gatewayが処理し、Nextのルートには渡らない。
export const PREVIEW_SIGNED_OUT_PATH = "/preview/signed-out";
// 未ログイン表示から本人のセッションへ戻し、`next`付きで/loginへ進める。
export const PREVIEW_SIGN_IN_PATH = "/preview/sign-in";
