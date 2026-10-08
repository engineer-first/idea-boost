import type { RoomPhase } from "./phase";
import type { SharingState } from "./room-protocol";

// RoomDOの共有状態を基準に、UIとサーバーで同じ公開許可を使う。
export function canPublishNoteInTurn(
  phase: RoomPhase,
  sharing: SharingState | null | undefined,
  userId: string,
): boolean {
  return (
    phase.kind === "step" &&
    phase.step === 2 &&
    sharing?.status === "active" &&
    sharing.startsAt === null &&
    sharing.currentIndex !== null &&
    sharing.order[sharing.currentIndex]?.userId === userId
  );
}

// 共有Step2で発表順が進行している間は、共有済み付箋の返却も発表者本人に限る。
// 順番が有効でない状態では既存の工程権限に委ねる。
export function canReturnNoteToPrivateInTurn(
  phase: RoomPhase,
  sharing: SharingState | null | undefined,
  userId: string,
): boolean {
  const hasActivePresenterTurn =
    phase.kind === "step" &&
    phase.step === 2 &&
    sharing?.status === "active" &&
    sharing.currentIndex !== null;
  return (
    !hasActivePresenterTurn || canPublishNoteInTurn(phase, sharing, userId)
  );
}
