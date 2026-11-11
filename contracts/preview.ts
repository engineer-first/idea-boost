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
// 作成を断った理由。画面にそのまま案内する。
export const PreviewRoomErrorSchema = z.object({ error: z.string().min(1) });

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

// 同じAccess本人のまま、このブラウザだけ2人目の参加者（相手役）として操作する入口。
// Gatewayが処理し、Nextのルートには渡らない。
export const PREVIEW_PARTNER_PATH = "/preview/partner";
// 相手役を解除して本人に戻す。
export const PREVIEW_SELF_PATH = "/preview/self";
const PARTNER_TAG = "+idea-boost-partner";
// 相手役の参加者用アドレス。配信には使わず、本人とは別のユーザーとして登録する識別子。
export function previewPartnerEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return `${email.slice(0, at)}${PARTNER_TAG}${email.slice(at)}`;
}
export function isPreviewPartnerEmail(email: string): boolean {
  return email.slice(0, email.lastIndexOf("@")).endsWith(PARTNER_TAG);
}
// 許可一覧の照合に使う、相手役の元になった本人のアドレス。
export function previewPrincipalEmail(email: string): string {
  if (!isPreviewPartnerEmail(email)) return email;
  const at = email.lastIndexOf("@");
  return `${email.slice(0, at - PARTNER_TAG.length)}${email.slice(at)}`;
}
