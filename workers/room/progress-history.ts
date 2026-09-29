import { type RoomPhase, RoomPhaseSchema } from "../../contracts/phase";
import {
  type ProgressHistoryEntry,
  type ProgressHistoryRecord,
  type ProgressHistoryResponse,
  SHARED_OUTCOME_RETENTION_MS,
  type SharedOutcomeSnapshot,
  SharedOutcomeSnapshotSchema,
} from "../../contracts/shared-outcomes";
import { syncRoomAlarm } from "./alarms";
import { captureSharedOutcome, readOutcomeState } from "./shared-outcomes";

type HistoryRow = {
  sequence: number;
  id: string;
  phase_json: string;
  next_phase_json: string | null;
  action: ProgressHistoryEntry["action"];
  entered_at: number | null;
  exited_at: number | null;
  save_status: ProgressHistoryEntry["saveStatus"];
  reflected_at: number | null;
};

// 呼出元のステップ更新と同じ transactionSync 内で実行する。
export function recordProgressTransition(
  sql: SqlStorage,
  current: RoomPhase,
  next: RoomPhase | null,
  action: NonNullable<ProgressHistoryEntry["action"]>,
  now = Date.now(),
  capture: () => SharedOutcomeSnapshot = () => captureSharedOutcome(sql, now),
): void {
  if (current.kind === "step") {
    let row = sql
      .exec<HistoryRow>(
        "SELECT * FROM progress_history WHERE exited_at IS NULL ORDER BY sequence DESC LIMIT 1",
      )
      .toArray()[0];
    if (!row) {
      sql.exec(
        "INSERT INTO progress_history(id,phase_json,save_status) VALUES(?,?,'open')",
        crypto.randomUUID(),
        JSON.stringify(current),
      );
      row = sql
        .exec<HistoryRow>(
          "SELECT * FROM progress_history ORDER BY sequence DESC LIMIT 1",
        )
        .one();
    }
    let snapshot: string | null = null;
    if (action !== "complete") {
      // 盤面の抽出・保全失敗は欠落として保存する。時刻の保存失敗は上位へ返し移行をrollbackする。
      try {
        snapshot = JSON.stringify(capture());
        sql.exec(
          "INSERT INTO progress_history_outbox(record_id,snapshot_json,retry_at) VALUES(?,?,?)",
          row.id,
          snapshot,
          now + 1000,
        );
      } catch {
        snapshot = null;
      }
    }
    sql.exec(
      "UPDATE progress_history SET next_phase_json=?,action=?,exited_at=?,save_status=? WHERE id=?",
      next ? JSON.stringify(next) : null,
      action,
      now,
      action === "complete" || snapshot !== null ? "pending" : "missing",
      row.id,
    );
  }
  if (next?.kind === "step")
    sql.exec(
      "INSERT INTO progress_history(id,phase_json,entered_at,save_status) VALUES(?,?,?,'open')",
      crypto.randomUUID(),
      JSON.stringify(next),
      now,
    );
  sql.exec(
    "UPDATE shared_outcome_state SET last_used_at=?,expires_at=?,retry_at=COALESCE(retry_at,?) WHERE id=1",
    now,
    now + SHARED_OUTCOME_RETENTION_MS,
    now + 1000,
  );
}

function entry(row: HistoryRow): ProgressHistoryEntry {
  return {
    id: row.id,
    sequence: row.sequence,
    phase: RoomPhaseSchema.parse(JSON.parse(row.phase_json)),
    nextPhase: row.next_phase_json
      ? RoomPhaseSchema.parse(JSON.parse(row.next_phase_json))
      : null,
    action: row.action,
    enteredAt: row.entered_at,
    exitedAt: row.exited_at,
    saveStatus: row.save_status,
    reflectedAt: row.reflected_at,
  };
}

export class ProgressHistoryStorage {
  private flushPromise: Promise<void> | null = null;
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly db: D1Database,
    private readonly project: (
      id: string,
      snapshot: string,
      expiresAt: number,
    ) => Promise<void>,
  ) {}
  private get sql(): SqlStorage {
    return this.ctx.storage.sql;
  }
  async list(cursor = 0): Promise<ProgressHistoryResponse | null> {
    const outcome = readOutcomeState(this.sql);
    if (!outcome || outcome.expires_at <= Date.now()) {
      await this.flush();
      return null;
    }
    const rows = this.sql
      .exec<HistoryRow>(
        "SELECT * FROM progress_history WHERE sequence > ? ORDER BY sequence LIMIT 51",
        cursor,
      )
      .toArray();
    return {
      entries: rows.slice(0, 50).map((row) => this.describe(row)),
      nextCursor: rows.length > 50 ? String(rows[49].sequence) : null,
    };
  }
  private describe(row: HistoryRow): ProgressHistoryEntry {
    const result = entry(row);
    if (row.action === "complete") {
      const outcome = readOutcomeState(this.sql);
      result.saveStatus = outcome?.save_status ?? "missing";
      result.reflectedAt =
        outcome?.save_status === "saved" ? outcome.last_saved_at : null;
    }
    return result;
  }
  async get(id: string): Promise<ProgressHistoryRecord | null> {
    const outcome = readOutcomeState(this.sql);
    if (!outcome || outcome.expires_at <= Date.now()) {
      await this.flush();
      return null;
    }
    const row = this.sql
      .exec<HistoryRow>("SELECT * FROM progress_history WHERE id=?", id)
      .toArray()[0];
    if (!row) return null;
    const summary = this.describe(row);
    const snapshot =
      summary.saveStatus !== "saved"
        ? null
        : row.action === "complete"
          ? outcome.saved_json
          : this.sql
              .exec<{ snapshot_json: string }>(
                "SELECT snapshot_json FROM progress_history_outbox WHERE record_id=?",
                id,
              )
              .toArray()[0]?.snapshot_json;
    return {
      ...summary,
      snapshot: snapshot
        ? SharedOutcomeSnapshotSchema.parse(JSON.parse(snapshot))
        : null,
    };
  }
  async writeProjection(
    id: string,
    snapshot: string,
    expiresAt: number,
  ): Promise<void> {
    const outcome = readOutcomeState(this.sql);
    if (!outcome || outcome.expires_at <= Date.now()) return;
    await this.db
      .prepare(
        "INSERT INTO progress_history_snapshots(room_id,record_id,snapshot_json,expires_at) VALUES(?,?,?,?) ON CONFLICT(room_id,record_id) DO NOTHING",
      )
      .bind(outcome.room_id, id, snapshot, expiresAt)
      .run();
  }
  async flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.flushOnce().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }
  private async flushOnce(): Promise<void> {
    const outcome = readOutcomeState(this.sql);
    if (!outcome) return;
    if (outcome.expires_at <= Date.now()) {
      try {
        await this.db
          .prepare("DELETE FROM progress_history_snapshots WHERE room_id=?")
          .bind(outcome.room_id)
          .run();
        this.ctx.storage.transactionSync(() => {
          this.sql.exec("DELETE FROM progress_history_outbox");
          this.sql.exec("DELETE FROM progress_history");
        });
      } catch {
        this.sql.exec(
          "UPDATE shared_outcome_state SET retry_at=? WHERE id=1",
          Date.now() + 60000,
        );
      }
      await syncRoomAlarm(this.ctx.storage, this.sql);
      return;
    }
    const rows = this.sql
      .exec<{ record_id: string; snapshot_json: string }>(
        "SELECT record_id,snapshot_json FROM progress_history_outbox WHERE retry_at IS NOT NULL ORDER BY rowid",
      )
      .toArray();
    for (const row of rows) {
      try {
        await this.project(
          row.record_id,
          row.snapshot_json,
          outcome.expires_at,
        );
        const latest = readOutcomeState(this.sql);
        // 非同期投影が期限削除より遅く完了しても、その本文を再び残さない。
        if (!latest || latest.expires_at <= Date.now()) {
          await this.db
            .prepare("DELETE FROM progress_history_snapshots WHERE room_id=?")
            .bind(outcome.room_id)
            .run();
          this.ctx.storage.transactionSync(() => {
            this.sql.exec("DELETE FROM progress_history_outbox");
            this.sql.exec("DELETE FROM progress_history");
          });
          break;
        }
        this.ctx.storage.transactionSync(() => {
          this.sql.exec(
            "UPDATE progress_history SET save_status='saved',reflected_at=? WHERE id=?",
            Date.now(),
            row.record_id,
          );
          this.sql.exec(
            "UPDATE progress_history_outbox SET retry_at=NULL WHERE record_id=?",
            row.record_id,
          );
        });
      } catch {
        this.sql.exec(
          "UPDATE progress_history SET save_status='failed' WHERE id=?",
          row.record_id,
        );
        this.sql.exec(
          "UPDATE progress_history_outbox SET retry_at=? WHERE record_id=?",
          Date.now() + 10000,
          row.record_id,
        );
      }
    }
    await syncRoomAlarm(this.ctx.storage, this.sql);
  }
}
