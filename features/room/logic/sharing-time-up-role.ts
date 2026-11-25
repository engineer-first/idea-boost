import type { SharingState } from "@/contracts/room-protocol";

// 共有ステップの時間切れで、自分がどの立場の一言を受け取るか。
export type SharingTimeUpRole = "presenter" | "listener" | "finished";

export function getSharingTimeUpRole(
  sharing: SharingState | null,
  currentUserId: string,
): SharingTimeUpRole {
  // 最後の人の交代で共有が終わると、タイマーも終了になる。渡す相手はもういない。
  if (sharing?.status === "complete") return "finished";
  // 発表者が分からないときは、従来どおり発表者向けの一言にする。
  if (sharing?.currentIndex == null) return "presenter";
  return sharing.order[sharing.currentIndex]?.userId === currentUserId
    ? "presenter"
    : "listener";
}
