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

// 共有Step2の返却は再共有できる発表者本人に限る。開始前・終了後も許可しない。
// 共有以外のステップでは既存の工程権限に委ねる。
export function canReturnNoteToPrivateInTurn(
  phase: RoomPhase,
  sharing: SharingState | null | undefined,
  userId: string,
): boolean {
  return (
    phase.kind !== "step" ||
    phase.step !== 2 ||
    canPublishNoteInTurn(phase, sharing, userId)
  );
}
