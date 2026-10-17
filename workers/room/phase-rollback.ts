import { type RoomPhase, RoomPhaseSchema } from "../../contracts/phase";
import type { TimerState } from "../../contracts/room-protocol";
import { syncRoomAlarm } from "./alarms";
import { isRoomClosed } from "./completed-rooms";
import {
  type MessageHandlers,
  replyForbidden,
  runAuthorizedMutationTransaction,
} from "./handler-context";
import { listMembers } from "./members";
import { getPhase, getPhaseRevision, savePhase } from "./phase";
import { recordProgressTransition } from "./progress-history";
import { getSharingState, saveSharingState } from "./sharing-state";
import { getTimerState, saveTimerState } from "./timer";

// テーブル名はサーバー内の固定allowlist。会員・ホスト・投影履歴は復元しない。
const BOARD_TABLES = [
  "notes",
  "note_appearances",
  "note_votes",
  "note_vote_stickers",
  "groups",
  "decisions",
  "note_bulk_exclusions",
  "note_content_versions",
  "note_move_versions",
] as const;
type StoredRow = Record<string, SqlStorageValue>;
type Checkpoint = {
  tables: Record<string, StoredRow[]>;
  map: { idea_map_size_level: number; idea_map_size_initialized: number };
  timer: TimerState;
  sharing: ReturnType<typeof getSharingState>;
};
export function clearRollbackHistory(sql: SqlStorage): void {
  sql.exec("DELETE FROM phase_rollback_checkpoints");
}
export function getRollbackTarget(sql: SqlStorage): RoomPhase | null {
  if (isRoomClosed(sql) || getPhase(sql).kind === "lobby") return null;
  const row = sql
    .exec(
      "SELECT phase_json FROM phase_rollback_checkpoints ORDER BY sequence DESC LIMIT 1",
    )
    .toArray()[0];
  return row ? RoomPhaseSchema.parse(JSON.parse(String(row.phase_json))) : null;
}
export function captureRollbackCheckpoint(
  sql: SqlStorage,
  phase: RoomPhase,
): void {
  if (phase.kind !== "step") return;
  const now = Date.now();
  const timer = getTimerState(sql, now);
  const sharing = getSharingState(sql);
  // 進行を再開せず、保存時点の残り時間と発表者を返す。
  const pausedTimer: TimerState =
    timer.status === "running"
      ? {
          status: "paused",
          durationMs: timer.durationMs,
          remainingMs: Math.max(0, timer.endsAt - now),
        }
      : timer;
  if (
    sharing?.startsAt !== null &&
    sharing?.startsAt !== undefined &&
    sharing.status === "active" &&
    timer.status === "idle"
  ) {
    // 交代待ちの発表も、復元後に明示的な再開が必要。
    saveCheckpoint({
      status: "paused",
      durationMs: sharing.durationMs,
      remainingMs: sharing.durationMs,
    });
  } else saveCheckpoint(pausedTimer);
  function saveCheckpoint(savedTimer: TimerState): void {
    const snapshot: Checkpoint = {
      tables: Object.fromEntries(
        BOARD_TABLES.map((table) => [
          table,
          sql.exec(`SELECT * FROM ${table}`).toArray(),
        ]),
      ),
      map: sql
        .exec(
          "SELECT idea_map_size_level,idea_map_size_initialized FROM room_state WHERE id=1",
        )
        .one() as Checkpoint["map"],
      timer: savedTimer,
      sharing: sharing ? { ...sharing, startsAt: null } : null,
    };
    sql.exec(
      "INSERT INTO phase_rollback_checkpoints (phase_json,snapshot_json) VALUES (?,?)",
      JSON.stringify(phase),
      JSON.stringify(snapshot),
    );
  }
}
export const rollbackHandlers: MessageHandlers<"phase:rollback"> = {
  "phase:rollback": async (ctx, message) => {
    const committed = await runAuthorizedMutationTransaction(ctx, async () => {
      if (
        isRoomClosed(ctx.sql) ||
        getPhaseRevision(ctx.sql) !== message.expectedRevision ||
        JSON.stringify(getPhase(ctx.sql)) !==
          JSON.stringify(message.expectedPhase)
      ) {
        replyForbidden(ctx);
        return false;
      }
      const row = ctx.sql
        .exec(
          "SELECT * FROM phase_rollback_checkpoints ORDER BY sequence DESC LIMIT 1",
        )
        .toArray()[0];
      if (!row || getPhase(ctx.sql).kind === "lobby") {
        replyForbidden(ctx);
        return false;
      }
      const target = RoomPhaseSchema.parse(JSON.parse(String(row.phase_json)));
      if (target.kind !== "step") {
        replyForbidden(ctx);
        return false;
      }
      recordProgressTransition(ctx.sql, getPhase(ctx.sql), target, "rollback");
      const snapshot = JSON.parse(String(row.snapshot_json)) as Checkpoint;
      // 外部操作receiptを復元しない。旧世代の再送はphaseRevisionで拒否する。
      // notesの削除に先立ちFK依存を消し、notesから順に再挿入する。
      for (const table of [...BOARD_TABLES].reverse())
        ctx.sql.exec(`DELETE FROM ${table}`);
      for (const table of BOARD_TABLES) {
        const columns = ctx.sql
          .exec(`PRAGMA table_info(${table})`)
          .toArray()
          .map((column) => String(column.name));
        for (const item of snapshot.tables[table]) {
          ctx.sql.exec(
            `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
            ...columns.map((column) => item[column]),
          );
        }
      }
      ctx.sql.exec(
        "UPDATE room_state SET idea_map_size_level=?,idea_map_size_initialized=?,map_revision=map_revision+1 WHERE id=1",
        snapshot.map.idea_map_size_level,
        snapshot.map.idea_map_size_initialized,
      );
      savePhase(ctx.sql, target);
      ctx.sql.exec(
        "UPDATE room_state SET rollback_revision=phase_revision WHERE id=1",
      );
      saveTimerState(ctx.sql, snapshot.timer);
      ctx.sql.exec("DELETE FROM sharing_state");
      const currentMembers = listMembers(ctx.sql);
      if (snapshot.sharing) {
        const newMembers = currentMembers.filter(
          (current) =>
            !snapshot.sharing?.order.some(
              (saved) => saved.userId === current.userId,
            ),
        );
        saveSharingState(ctx.sql, {
          ...snapshot.sharing,
          order: [
            ...snapshot.sharing.order.map(
              (saved) =>
                currentMembers.find(
                  (current) => current.userId === saved.userId,
                ) ?? saved,
            ),
            ...newMembers,
          ],
          // 一巡後の途中参加は通常参加と同じく、ホストの明示開始を待つ。
          status:
            snapshot.sharing.status === "complete" && newMembers.length > 0
              ? "ready"
              : snapshot.sharing.status,
          revision: crypto.randomUUID(),
          startsAt: null,
        });
      }
      ctx.sql.exec("DELETE FROM legacy_note_drag_leases");
      ctx.sql.exec(
        "DELETE FROM phase_rollback_checkpoints WHERE sequence=?",
        row.sequence,
      );
      await syncRoomAlarm(ctx.storage, ctx.sql);
      return true;
    });
    if (!committed) return;
    ctx.broadcaster.retireAllActiveDrags();
    ctx.broadcaster.retireAllAdoptionFocus();
    ctx.refreshSnapshots();
  },
};
