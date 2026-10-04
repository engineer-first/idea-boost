import type {
  CompletedBoardResponse,
  CompletedRoom,
  CompletedScene,
  CompletedSceneKind,
} from "../../contracts/completed-rooms";
import {
  SHARED_OUTCOME_RETENTION_MS,
  type SharedOutcomeSnapshot,
} from "../../contracts/shared-outcomes";
import type { ProgressHistoryStorage } from "./progress-history";
import { readOutcomeState } from "./shared-outcomes";

type FixedScene = {
  kind: CompletedSceneKind;
  recordId: string | null;
  recordedAt: number | null;
  missing: boolean;
};
type CompletionRow = {
  id: number;
  room_id: string;
  completed_at: number;
  expires_at: number;
  decisions_json: string | null;
  scenes_json: string | null;
  viewers_json: string | null;
  retry_at: number | null;
  deleted: number;
};
const sceneTransitions: Array<{
  kind: CompletedSceneKind;
  phase: number;
  step: number;
  nextPhase: number | null;
  nextStep: number | null;
}> = [
  { kind: "problem-grouping", phase: 1, step: 3, nextPhase: 1, nextStep: 4 },
  { kind: "problem-decision", phase: 1, step: 5, nextPhase: 2, nextStep: 1 },
  { kind: "question-decision", phase: 2, step: 4, nextPhase: 3, nextStep: 1 },
  { kind: "idea-mapping", phase: 3, step: 3, nextPhase: 3, nextStep: 4 },
  { kind: "idea-decision", phase: 3, step: 5, nextPhase: null, nextStep: null },
];
export function readCompletion(sql: SqlStorage): CompletionRow | null {
  return (
    sql
      .exec<CompletionRow>("SELECT * FROM completed_room WHERE id=1")
      .toArray()[0] ?? null
  );
}
export function isRoomClosed(sql: SqlStorage): boolean {
  return (
    readCompletion(sql) !== null ||
    readOutcomeState(sql)?.disbanded === 1 ||
    sql.exec("SELECT outcome_published FROM room_state WHERE id=1").toArray()[0]
      ?.outcome_published === 1
  );
}
// preserveSharedOutcome の transactionSync 内で、終端履歴を書いた直後にだけ呼ぶ。
export function fixCompletion(
  sql: SqlStorage,
  snapshot: SharedOutcomeSnapshot,
  now: number,
): void {
  if (readCompletion(sql)) return;
  if (
    ![1, 2, 3].every((phase) =>
      snapshot.decisions.some((d) => d.phase === phase),
    )
  )
    throw new Error("確定した3件が揃っていません。");
  const outcome = readOutcomeState(sql);
  if (!outcome || outcome.disbanded)
    throw new Error("完了記録の保存先がありません。");
  const scenes: FixedScene[] = sceneTransitions.map((t) => {
    const row = sql
      .exec<{ id: string; exited_at: number; save_status: string }>(
        `SELECT id,exited_at,save_status FROM progress_history WHERE json_extract(phase_json,'$.phase')=? AND json_extract(phase_json,'$.step')=? AND action=? AND (? IS NULL OR (json_extract(next_phase_json,'$.phase')=? AND json_extract(next_phase_json,'$.step')=?)) ORDER BY sequence DESC LIMIT 1`,
        t.phase,
        t.step,
        t.nextPhase === null ? "complete" : "next",
        t.nextPhase,
        t.nextPhase,
        t.nextStep,
      )
      .toArray()[0];
    return {
      kind: t.kind,
      recordId: row?.id ?? null,
      recordedAt: row?.exited_at ?? null,
      missing: row?.save_status === "missing",
    };
  });
  const viewers = sql
    .exec<{ user_id: string }>(
      "SELECT user_id FROM members UNION SELECT user_id FROM retained_outcome_participants ORDER BY user_id",
    )
    .toArray()
    .map((r) => r.user_id);
  const decisions = snapshot.decisions.map(({ phase, noteId, content }) => ({
    phase,
    noteId,
    content,
  }));
  sql.exec(
    "INSERT INTO completed_room(id,room_id,completed_at,expires_at,decisions_json,scenes_json,viewers_json,retry_at) VALUES(1,?,?,?,?,?,?,?)",
    outcome.room_id,
    now,
    now + SHARED_OUTCOME_RETENTION_MS,
    JSON.stringify(decisions),
    JSON.stringify(scenes),
    JSON.stringify(viewers),
    now + 1000,
  );
  sql.exec("DELETE FROM retained_outcome_participants");
  sql.exec("DELETE FROM pending_phase_transition");
  sql.exec("DELETE FROM sharing_state");
  sql.exec(
    "UPDATE timer_state SET status='idle',ends_at=NULL,remaining_ms=NULL,duration_ms=NULL WHERE id=1",
  );
}
export class CompletedRoomStorage {
  private flushPromise: Promise<void> | null = null;
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly db: D1Database,
    private readonly history: ProgressHistoryStorage,
  ) {}
  private get sql(): SqlStorage {
    return this.ctx.storage.sql;
  }
  // 退出と同じtransactionSyncで呼び、外部索引より先に取得権を失効させる。
  revokeViewer(userId: string): void {
    const row = readCompletion(this.sql);
    if (!row?.viewers_json || row.deleted) return;
    const viewers = JSON.parse(row.viewers_json) as string[];
    if (!viewers.includes(userId)) return;
    this.sql.exec(
      "UPDATE completed_room SET viewers_json=?,retry_at=? WHERE id=1",
      JSON.stringify(viewers.filter((viewer) => viewer !== userId)),
      Date.now() + 1000,
    );
  }
  private authorized(userId: string): CompletionRow | null {
    const row = readCompletion(this.sql);
    if (
      !row ||
      row.deleted ||
      row.expires_at <= Date.now() ||
      !row.viewers_json ||
      !(JSON.parse(row.viewers_json) as string[]).includes(userId)
    )
      return null;
    return row;
  }
  private async describe(scene: FixedScene): Promise<CompletedScene> {
    if (!scene.recordId)
      return { kind: scene.kind, recordedAt: null, status: "before-recording" };
    if (scene.missing)
      return {
        kind: scene.kind,
        recordedAt: scene.recordedAt,
        status: "missing",
      };
    const record = await this.history.get(scene.recordId);
    return {
      kind: scene.kind,
      recordedAt: scene.recordedAt,
      status:
        record?.saveStatus === "open"
          ? "missing"
          : (record?.saveStatus ?? "missing"),
    };
  }
  async get(userId: string): Promise<CompletedRoom | null> {
    const row = this.authorized(userId);
    if (!row?.decisions_json || !row.scenes_json) return null;
    const decisions = JSON.parse(
      row.decisions_json,
    ) as CompletedRoom["decisions"];
    const scenes = await Promise.all(
      (JSON.parse(row.scenes_json) as FixedScene[]).map((scene) =>
        this.describe(scene),
      ),
    );
    if (!this.authorized(userId)) return null;
    return {
      roomId: row.room_id,
      completedAt: row.completed_at,
      expiresAt: row.expires_at,
      idea: decisions.find((d) => d.phase === 3)?.content ?? "",
      decisions,
      scenes,
    };
  }
  async board(
    userId: string,
    kind: CompletedSceneKind,
  ): Promise<CompletedBoardResponse | null> {
    const row = this.authorized(userId);
    if (!row?.scenes_json) return null;
    const selected = (JSON.parse(row.scenes_json) as FixedScene[]).find(
      (s) => s.kind === kind,
    );
    if (!selected) return null;
    const scene = await this.describe(selected);
    const record =
      selected.recordId && scene.status === "saved"
        ? await this.history.get(selected.recordId)
        : null;
    if (!this.authorized(userId)) return null;
    if (!record?.snapshot || scene.recordedAt === null)
      return { scene, board: null };
    const phase = sceneTransitions.find((s) => s.kind === kind)?.phase ?? 1;
    const snapshot = record.snapshot;
    const notes = snapshot.notes
      .filter((n) => n.phase === phase)
      .map(({ id, content, x, y, color, fontSize, stackOrder, excluded }) => ({
        id,
        content,
        x,
        y,
        color,
        fontSize,
        stackOrder,
        excluded,
      }));
    const ids = new Set(notes.map((n) => n.id));
    return {
      scene,
      board: {
        kind,
        recordedAt: scene.recordedAt,
        phase,
        notes,
        groups: snapshot.groups
          .map(({ id, name, noteIds }) => ({
            id,
            name,
            noteIds: noteIds.filter((id) => ids.has(id)),
          }))
          .filter((g) => g.noteIds.length > 0),
        ideaMapSizeLevel: snapshot.ideaMapSizeLevel,
        decisions: snapshot.decisions
          .filter((d) => d.phase === phase)
          .map(({ phase, noteId, content }) => ({ phase, noteId, content })),
      },
    };
  }
  async flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.flushOnce().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }
  private async flushOnce(): Promise<void> {
    const row = readCompletion(this.sql);
    if (!row || row.deleted) return;
    if (row.expires_at <= Date.now()) {
      await this.expire(row);
      return;
    }
    if (row.retry_at === null || !row.viewers_json) return;
    try {
      const viewers = JSON.parse(row.viewers_json) as string[];
      await this.db.batch([
        this.db
          .prepare("DELETE FROM completed_room_viewers WHERE room_id=?")
          .bind(row.room_id),
        ...viewers.map((userId) =>
          this.db
            .prepare(
              "INSERT INTO completed_room_viewers(user_id,room_id,completed_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(user_id,room_id) DO NOTHING",
            )
            .bind(userId, row.room_id, row.completed_at, row.expires_at),
        ),
      ]);
      await this.db
        .prepare(
          "UPDATE progress_history_snapshots SET expires_at=? WHERE room_id=?",
        )
        .bind(row.expires_at, row.room_id)
        .run();
      if (row.expires_at <= Date.now()) {
        await this.expire(row);
        return;
      }
      // 外部I/O中の退出が更新した閲覧者を、古い投影の成功でackしない。
      this.sql.exec(
        "UPDATE completed_room SET retry_at=NULL WHERE id=1 AND viewers_json=? AND deleted=0",
        row.viewers_json,
      );
    } catch {
      this.sql.exec(
        "UPDATE completed_room SET retry_at=? WHERE id=1",
        Date.now() + 10000,
      );
    }
  }
  private async expire(row: CompletionRow): Promise<void> {
    // ハイバネーション中の接続にも参加者属性を残さない。
    for (const socket of this.ctx.getWebSockets()) {
      socket.serializeAttachment(null);
      try {
        socket.close(4001, "保存期間が終了しました。");
      } catch {
        /* 切断済み */
      }
    }
    try {
      await this.db.batch([
        this.db
          .prepare("DELETE FROM completed_room_viewers WHERE room_id=?")
          .bind(row.room_id),
        this.db
          .prepare("DELETE FROM progress_history_snapshots WHERE room_id=?")
          .bind(row.room_id),
        this.db
          .prepare("DELETE FROM shared_outcomes WHERE room_id=?")
          .bind(row.room_id),
        this.db.prepare("DELETE FROM rooms WHERE id=?").bind(row.room_id),
      ]);
      this.ctx.storage.transactionSync(() => {
        for (const table of [
          "notes",
          "members",
          "retained_outcome_participants",
          "groups",
          "decisions",
          "note_votes",
          "note_vote_stickers",
          "note_content_receipts",
          "note_content_versions",
          "note_appearances",
          "note_bulk_exclusions",
          "used_note_drag_ids",
          "member_color_assignments",
          "pending_phase_transition",
          "sharing_state",
          "progress_history_outbox",
          "progress_history",
        ])
          this.sql.exec(`DELETE FROM ${table}`);
        this.sql.exec(
          "UPDATE shared_outcome_identity SET room_name=NULL,disbanded=1 WHERE id=1",
        );
        this.sql.exec(
          "UPDATE shared_outcome_state SET saved_json=NULL,pending_json=NULL,last_saved_at=NULL,retry_at=NULL WHERE id=1",
        );
        this.sql.exec(
          "UPDATE completed_room SET decisions_json=NULL,scenes_json=NULL,viewers_json=NULL,retry_at=NULL,deleted=1 WHERE id=1",
        );
        this.sql.exec("UPDATE room_owner SET host_id=NULL WHERE id=1");
        this.sql.exec(
          "UPDATE timer_state SET status='idle',ends_at=NULL,remaining_ms=NULL,duration_ms=NULL WHERE id=1",
        );
      });
    } catch {
      this.sql.exec(
        "UPDATE completed_room SET retry_at=? WHERE id=1",
        Date.now() + 60000,
      );
    }
  }
}
