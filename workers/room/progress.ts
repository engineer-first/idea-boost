import type { RoomPhase as Phase } from "../../contracts/phase";
import type { PhaseProgress } from "../../contracts/room-protocol";
import type { RoomBroadcaster } from "./broadcast";
import { isMember } from "./members";

export function listConnectedMemberIds(
  sql: SqlStorage,
  broadcaster: RoomBroadcaster,
): string[] {
  return broadcaster.connectedUserIds((userId) => isMember(sql, userId));
}

// 接続中の参加者の一覧と、その更新番号。完了の表明は廃止したので（ADR 0037）、
// 旧クライアント向けの4つのフィールドは「接続中の全員が完了済み」で埋める。
export function getProgressState(
  sql: SqlStorage,
  broadcaster: RoomBroadcaster,
  _phase: Phase,
  phaseRevision: number,
): PhaseProgress {
  const connectedUserIds = listConnectedMemberIds(sql, broadcaster);
  const progressRevision = Number(
    sql.exec("SELECT progress_revision FROM room_state WHERE id = 1").one()
      .progress_revision,
  );
  return {
    phaseRevision,
    progressRevision,
    connectedUserIds,
    readyUserIds: connectedUserIds,
    notReadyUserIds: [],
    canAdvance: connectedUserIds.length > 0,
    allReady: connectedUserIds.length > 0,
  };
}

export function bumpProgressRevision(sql: SqlStorage): void {
  sql.exec(
    "UPDATE room_state SET progress_revision = progress_revision + 1 WHERE id = 1",
  );
}

export function syncProgressConnectedUsers(
  sql: SqlStorage,
  broadcaster: RoomBroadcaster,
): boolean {
  const connectedUserIds = broadcaster.connectedUserIds((userId) =>
    isMember(sql, userId),
  );
  const row = sql
    .exec("SELECT progress_connected_user_ids FROM room_state WHERE id = 1")
    .one() as { progress_connected_user_ids: string };
  let previous: string[];
  try {
    const parsed: unknown = JSON.parse(row.progress_connected_user_ids);
    previous =
      Array.isArray(parsed) && parsed.every((id) => typeof id === "string")
        ? parsed
        : [];
  } catch {
    previous = [];
  }
  if (JSON.stringify(previous) === JSON.stringify(connectedUserIds))
    return false;
  sql.exec(
    "UPDATE room_state SET progress_connected_user_ids = ?1, progress_revision = progress_revision + 1 WHERE id = 1",
    JSON.stringify(connectedUserIds),
  );
  return true;
}

export function broadcastProgress(
  sql: SqlStorage,
  broadcaster: RoomBroadcaster,
  phase: Phase,
  phaseRevision: number,
): PhaseProgress {
  const progress = getProgressState(sql, broadcaster, phase, phaseRevision);
  broadcaster.broadcastToAll({ type: "phase:progress", progress });
  return progress;
}
