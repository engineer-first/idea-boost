import {
  isPersonalWritingStep,
  isVotingStep,
  type RoomPhase as Phase,
} from "../../contracts/phase";
import type { PhaseProgress } from "../../contracts/room-protocol";
import type { RoomBroadcaster } from "./broadcast";
import { isMember } from "./members";
import { listCompletedVoterIds } from "./votes";

export function hasStrictMajority(
  readyCount: number,
  connectedCount: number,
): boolean {
  return connectedCount > 0 && readyCount >= connectedCount / 2;
}

export function isManualProgressStep(phase: Phase): boolean {
  return (
    isPersonalWritingStep(phase) ||
    (phase.kind === "step" &&
      ((phase.phase === 1 && phase.step === 3) ||
        (phase.phase === 3 && phase.step === 3)))
  );
}

export function getProgressState(
  sql: SqlStorage,
  broadcaster: RoomBroadcaster,
  phase: Phase,
  phaseRevision: number,
): PhaseProgress {
  const connectedUserIds = broadcaster.connectedUserIds((userId) =>
    isMember(sql, userId),
  );
  const connected = new Set(connectedUserIds);
  const readyUserIds =
    phase.kind === "step" && isVotingStep(phase)
      ? listCompletedVoterIds(sql, phase.phase).filter((userId) =>
          connected.has(userId),
        )
      : isManualProgressStep(phase)
        ? (
            sql
              .exec(
                "SELECT user_id FROM phase_progress_ready WHERE phase_revision = ?1 AND ready = 1 ORDER BY user_id",
                phaseRevision,
              )
              .toArray() as Array<{ user_id: string }>
          )
            .map(({ user_id }) => user_id)
            .filter((userId) => connected.has(userId))
        : [];
  const ready = new Set(readyUserIds);
  const notReadyUserIds = connectedUserIds.filter(
    (userId) => !ready.has(userId),
  );
  const progressRevision = Number(
    sql.exec("SELECT progress_revision FROM room_state WHERE id = 1").one()
      .progress_revision,
  );
  return {
    phaseRevision,
    progressRevision,
    connectedUserIds,
    readyUserIds,
    notReadyUserIds,
    canAdvance: hasStrictMajority(readyUserIds.length, connectedUserIds.length),
    allReady:
      connectedUserIds.length > 0 &&
      readyUserIds.length === connectedUserIds.length,
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

export function clearProgressReady(sql: SqlStorage): void {
  sql.exec("DELETE FROM phase_progress_ready");
  bumpProgressRevision(sql);
}

export function clearCurrentProgressReady(
  sql: SqlStorage,
  phaseRevision: number,
): void {
  sql.exec(
    "DELETE FROM phase_progress_ready WHERE phase_revision = ?1",
    phaseRevision,
  );
  bumpProgressRevision(sql);
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
