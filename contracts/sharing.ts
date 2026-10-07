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
