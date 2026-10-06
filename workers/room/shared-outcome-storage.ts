import {
  SHARED_OUTCOME_RETENTION_MS,
  type SharedOutcomeRecord,
  type SharedOutcomeSnapshot,
} from "../../contracts/shared-outcomes";
import { syncRoomAlarm } from "./alarms";
import { discardPrivateNotes, getPhase } from "./phase";
import { recordProgressTransition } from "./progress-history";
import {
  captureSharedOutcome,
  outcomeRecord,
  readOutcomeState,
} from "./shared-outcomes";

// RoomDO 内でだけ使う成果保全・外部投影 outbox。DO façade は認可と通知を担当する。
export class SharedOutcomeStorage {
  private outcomeFlush: Promise<void> | null = null;
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly db: D1Database,
    private readonly project: (
      snapshot: SharedOutcomeSnapshot | null,
    ) => Promise<void>,
  ) {}
  private get sql(): SqlStorage {
    return this.ctx.storage.sql;
  }
  // 既存ルームも最初の通常アクセスで導入する。作成日時を用い、閲覧で期限を延ばさない。
  async ensureSharedOutcome(roomId: string, createdAt?: number): Promise<void> {
    if (!readOutcomeState(this.sql))
      await this.initializeSharedOutcome(roomId, undefined, createdAt);
  }

  async initializeSharedOutcome(
    roomId: string,
    name?: string,
    createdAt = Date.now(),
  ): Promise<void> {
    if (readOutcomeState(this.sql)) return;
    this.initializeSharedOutcomeState(roomId, name, createdAt);
    await this.preserveSharedOutcome(false, createdAt);
    await this.flushSharedOutcome();
  }

  initializeSharedOutcomeState(
    roomId: string,
    name?: string,
    createdAt = Date.now(),
  ): void {
    if (readOutcomeState(this.sql)) return;
    const displayId = crypto
      .randomUUID()
      .replaceAll("-", "")
      .slice(0, 8)
      .toUpperCase();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        "INSERT INTO shared_outcome_identity(id,room_id,room_name,display_id) VALUES(1,?,?,?)",
        roomId,
        name?.trim() || null,
        displayId,
      );
      this.sql.exec(
        "INSERT INTO shared_outcome_state(id,last_used_at,expires_at,phase_json) VALUES(1,?,?,?)",
        createdAt,
        createdAt + SHARED_OUTCOME_RETENTION_MS,
        JSON.stringify(getPhase(this.sql)),
      );
      const snapshot = captureSharedOutcome(this.sql, createdAt);
      this.sql.exec(
        "UPDATE shared_outcome_state SET pending_json=?, save_status='pending', retry_at=? WHERE id=1",
        JSON.stringify(snapshot),
        createdAt + 1000,
      );
    });
  }

  async preserveSharedOutcome(
    confirmed = false,
    now = Date.now(),
    onConfirmed?: (snapshot: SharedOutcomeSnapshot, now: number) => void,
  ): Promise<void> {
    const row = readOutcomeState(this.sql);
    if (confirmed && (!row || row.disbanded))
      throw new Error("成果保全が初期化されていません。");
    if (!row || row.disbanded || (row.confirmed && !onConfirmed)) return;
    const snapshot = row.confirmed
      ? (JSON.parse(
          row.pending_json ?? row.saved_json ?? "null",
        ) as SharedOutcomeSnapshot | null)
      : captureSharedOutcome(this.sql, now);
    if (confirmed && !snapshot) throw new Error("完了内容がありません。");
    this.ctx.storage.transactionSync(() => {
      if (confirmed) {
        recordProgressTransition(
          this.sql,
          getPhase(this.sql),
          null,
          "complete",
          now,
        );
        this.sql.exec("UPDATE room_state SET outcome_published=1 WHERE id=1");
        // 採用は取り消せるため、下書きの破棄は成果公開の確定と同時に行う。
        discardPrivateNotes(this.sql);
        if (snapshot) onConfirmed?.(snapshot, now);
      }
      this.sql.exec(
        "UPDATE shared_outcome_state SET last_used_at = ?, expires_at = ? WHERE id = 1",
        now,
        now + SHARED_OUTCOME_RETENTION_MS,
      );
      if (snapshot)
        this.sql.exec(
          "UPDATE shared_outcome_state SET pending_json = ?, phase_json = ?, confirmed = ?, save_status = 'pending', retry_at = ? WHERE id = 1",
          JSON.stringify(snapshot),
          JSON.stringify(snapshot.phase),
          confirmed ? 1 : 0,
          now + 1000,
        );
      else
        this.sql.exec(
          "UPDATE shared_outcome_state SET retry_at = ? WHERE id = 1",
          now + 1000,
        );
    });
    await this.finishSharedActivity(row.room_id, now);
  }

  // タイマー・共有の進行は利用日時だけを進める。既存の保全盤面や成功時刻は変更しない。
  async recordSharedActivity(now = Date.now()): Promise<void> {
    const row = readOutcomeState(this.sql);
    if (!row || row.disbanded || row.confirmed) return;
    this.sql.exec(
      "UPDATE shared_outcome_state SET last_used_at = ?, expires_at = ?, retry_at = COALESCE(retry_at, ?) WHERE id = 1",
      now,
      now + SHARED_OUTCOME_RETENTION_MS,
      now + 1000,
    );
    await this.finishSharedActivity(row.room_id, now);
  }

  private async finishSharedActivity(
    _roomId: string,
    _now: number,
  ): Promise<void> {
    // sync() は DO のローカル永続化だけを待つ。外部保存の成功を完了条件にしない。
    await this.ctx.storage.sync();
    await syncRoomAlarm(this.ctx.storage, this.sql);
  }

  async writeSharedOutcomeProjection(
    snapshot: SharedOutcomeSnapshot | null,
  ): Promise<void> {
    const row = readOutcomeState(this.sql);
    if (!row) return;
    const db = this.db;
    await db
      .prepare(
        "INSERT INTO shared_outcomes(room_id,last_used_at,expires_at,snapshot_json) VALUES(?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET last_used_at=excluded.last_used_at, expires_at=excluded.expires_at, snapshot_json=COALESCE(excluded.snapshot_json, shared_outcomes.snapshot_json)",
      )
      .bind(
        row.room_id,
        row.last_used_at,
        row.expires_at,
        snapshot ? JSON.stringify(snapshot) : null,
      )
      .run();
  }

  async flushSharedOutcome(): Promise<void> {
    if (this.outcomeFlush) return this.outcomeFlush;
    this.outcomeFlush = this.flushSharedOutcomeOnce().finally(() => {
      this.outcomeFlush = null;
    });
    return this.outcomeFlush;
  }

  private async flushSharedOutcomeOnce(): Promise<void> {
    const row = readOutcomeState(this.sql);
    if (!row) return;
    if (row.expires_at <= Date.now()) {
      await this.ctx.blockConcurrencyWhile(async () => {
        const current = readOutcomeState(this.sql);
        if (!current || current.expires_at > Date.now()) return;
        try {
          await this.db
            .prepare("DELETE FROM shared_outcomes WHERE room_id = ?")
            .bind(current.room_id)
            .run();
          this.sql.exec("DELETE FROM retained_outcome_participants");
          this.sql.exec(
            "UPDATE shared_outcome_identity SET room_name = NULL WHERE id = 1",
          );
          this.sql.exec(
            "UPDATE shared_outcome_state SET pending_json = NULL, saved_json = NULL, last_saved_at = NULL, retry_at = NULL WHERE id = 1",
          );
        } catch {
          console.error("shared-outcome-expiry-delete-failed", {
            roomId: current.room_id,
          });
          this.sql.exec(
            "UPDATE shared_outcome_state SET retry_at = ? WHERE id = 1",
            Date.now() + 60000,
          );
        }
      });
      await syncRoomAlarm(this.ctx.storage, this.sql);
      return;
    }
    if (row.retry_at === null) return;
    try {
      await this.project(
        row.pending_json
          ? (JSON.parse(row.pending_json) as SharedOutcomeSnapshot)
          : null,
      );
      const latest = readOutcomeState(this.sql);
      if (!latest || latest.expires_at <= Date.now()) {
        await this.db
          .prepare("DELETE FROM shared_outcomes WHERE room_id=?")
          .bind(row.room_id)
          .run();
        this.sql.exec(
          "UPDATE shared_outcome_state SET saved_json=NULL,pending_json=NULL,last_saved_at=NULL,retry_at=NULL WHERE id=1",
        );
        await syncRoomAlarm(this.ctx.storage, this.sql);
        return;
      }
      // 外部 I/O 中に新しい保全が入っても、送信した版だけを成功にする。
      this.sql.exec(
        `UPDATE shared_outcome_state SET
        saved_json = COALESCE(?1, saved_json),
        last_saved_at = CASE WHEN ?1 IS NOT NULL THEN ?2 ELSE last_saved_at END,
        save_status = CASE WHEN pending_json IS ?1 THEN 'saved' ELSE 'pending' END,
        retry_at = CASE WHEN pending_json IS ?1 AND last_used_at = ?3 THEN NULL ELSE ?2 + 1000 END,
        pending_json = CASE WHEN pending_json IS ?1 THEN NULL ELSE pending_json END
        WHERE id = 1`,
        row.pending_json,
        Date.now(),
        row.last_used_at,
      );
    } catch {
      this.sql.exec(
        "UPDATE shared_outcome_state SET save_status = 'failed', retry_at = ? WHERE id = 1",
        Date.now() + 10000,
      );
      console.error("shared-outcome-projection-failed", {
        roomId: row.room_id,
      });
    }
    await syncRoomAlarm(this.ctx.storage, this.sql);
  }

  async getSharedOutcome(): Promise<SharedOutcomeRecord | null> {
    const row = readOutcomeState(this.sql);
    if (!row) return null;
    if (row.expires_at <= Date.now()) {
      await this.flushSharedOutcome();
      return null;
    }
    return outcomeRecord(row);
  }
}
