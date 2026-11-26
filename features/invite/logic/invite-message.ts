// チャット（Discord など）へそのまま貼れる招待文を組み立てる。
// 載せるのは招待を受けた人が参加に使う情報（テーマ・参加リンク・招待コード）だけ。
export type InviteMessageInput = {
  roomName?: string | null;
  inviteCode: string;
  inviteUrl: string;
};

export function buildInviteMessage({
  roomName,
  inviteCode,
  inviteUrl,
}: InviteMessageInput): string {
  const name = roomName?.trim();
  return [
    "Idea Boost のルームに招待します。",
    ...(name ? [`テーマ: ${name}`] : []),
    `参加リンク: ${inviteUrl}`,
    `招待コード: ${inviteCode}`,
  ].join("\n");
}
