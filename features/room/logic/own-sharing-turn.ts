import type { SharingState } from "@/contracts/room-protocol";

/**
 * 共有ステップで、自分にもう発表の番が来ないか。
 * 全員の発表が終わったときに加え、自分の番を発表し終えた・パスされたときも true。
 * 番は順番の一覧を前から一度ずつ回るだけで、終わった人へは戻らない。
 * 全員が終わった後に途中参加で ready に戻っても、終えた人の results は残るので true のまま。
 */
export function isOwnSharingTurnOver(
  sharing: SharingState | null | undefined,
  currentUserId: string,
): boolean {
  if (sharing == null) return false;
  if (sharing.status === "complete") return true;
  const ownIndex = sharing.order.findIndex(
    (member) => member.userId === currentUserId,
  );
  return ownIndex >= 0 && sharing.results[ownIndex] !== undefined;
}
