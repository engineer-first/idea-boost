// チャット（Discord など）へそのまま貼れる招待文を組み立てる。
// 載せるのは招待を受けた人が参加に使う情報（テーマ・参加リンク・招待コード）だけ。
import type { AppLocale } from "@/contracts/app-locale";

export type InviteMessageInput = {
  roomName?: string | null;
  inviteCode: string;
  inviteUrl: string;
  // 招待文を作る人の表示言語。テーマは参加者が書いた原文のまま載せる。
  locale?: AppLocale;
};

export function buildInviteMessage({
  roomName,
  inviteCode,
  inviteUrl,
  locale = "ja",
}: InviteMessageInput): string {
  const name = roomName?.trim();
  if (locale === "en")
    return [
      "You're invited to an Idea Boost room.",
      ...(name ? [`Topic: ${name}`] : []),
      `Join link: ${inviteUrl}`,
      `Invitation code: ${inviteCode}`,
    ].join("\n");
  return [
    "Idea Boost のルームに招待します。",
    ...(name ? [`テーマ: ${name}`] : []),
    `参加リンク: ${inviteUrl}`,
    `招待コード: ${inviteCode}`,
  ].join("\n");
}
