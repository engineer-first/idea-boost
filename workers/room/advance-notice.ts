// 次のステップへ進む前に全員へ出す予告の保存状態（ADR 0037）。
// 1ルームに同時に1つだけ持ち、残り時間と取り消しの真実をここに置く。
// 開始・取り消し・確定の判断は phase.ts が持つ。
import type {
  AdvanceNotice,
  AdvanceNoticeEndReason,
} from "../../contracts/room-protocol";
import type { RoomBroadcaster } from "./broadcast";

export function getAdvanceNotice(sql: SqlStorage): AdvanceNotice | null {
  const row = sql
    .exec(
      "SELECT notice_id, phase_revision, cause, initiator_user_id, ends_at, duration_ms FROM advance_notice WHERE id = 1",
    )
    .toArray()[0] as
    | {
        notice_id: string;
        phase_revision: number;
        cause: AdvanceNotice["trigger"];
        initiator_user_id: string | null;
        ends_at: number;
        duration_ms: number;
      }
    | undefined;
  if (!row) return null;
  return {
    noticeId: row.notice_id,
    phaseRevision: row.phase_revision,
    trigger: row.cause,
    initiatorUserId: row.initiator_user_id,
    endsAt: row.ends_at,
    durationMs: row.duration_ms,
  };
}

export function saveAdvanceNotice(
  sql: SqlStorage,
  notice: AdvanceNotice,
): void {
  sql.exec(
    `INSERT INTO advance_notice (id, notice_id, phase_revision, cause, initiator_user_id, ends_at, duration_ms)
     VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET notice_id = excluded.notice_id,
       phase_revision = excluded.phase_revision, cause = excluded.cause,
       initiator_user_id = excluded.initiator_user_id,
       ends_at = excluded.ends_at, duration_ms = excluded.duration_ms`,
    notice.noticeId,
    notice.phaseRevision,
    notice.trigger,
    notice.initiatorUserId,
    notice.endsAt,
    notice.durationMs,
  );
}

export function clearAdvanceNotice(sql: SqlStorage): boolean {
  return sql.exec("DELETE FROM advance_notice").rowsWritten > 0;
}

// 投票がそろった予告を誰かが止めた工程では、自動の予告を出し直さない。
export function holdVotesNotice(sql: SqlStorage, phaseRevision: number): void {
  sql.exec(
    "INSERT INTO advance_notice_votes_hold (id, phase_revision) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET phase_revision = excluded.phase_revision",
    phaseRevision,
  );
}

export function isVotesNoticeHeld(
  sql: SqlStorage,
  phaseRevision: number,
): boolean {
  return (
    sql
      .exec(
        "SELECT 1 FROM advance_notice_votes_hold WHERE id = 1 AND phase_revision = ?1",
        phaseRevision,
      )
      .toArray().length > 0
  );
}

export function broadcastAdvanceNotice(
  broadcaster: RoomBroadcaster,
  notice: AdvanceNotice | null,
  reason?: AdvanceNoticeEndReason,
): void {
  broadcaster.broadcastToAll({
    type: "phase:notice",
    notice,
    ...(reason ? { reason } : {}),
    serverNow: Date.now(),
  });
}
