// 付箋（notes）の真実。ストレージアクセス・可視性判定・プロトコル射影と、
// 受信者ごとの可視性を踏まえたノート配信ヘルパをここに集約する。

import { NOTE_DEFAULT_FONT_SIZE } from "../../contracts/board";
import { isVotingStep } from "../../contracts/phase";
import type { NoteColor, ProtocolNote } from "../../contracts/room-protocol";
import { projectNoteForViewer, visibleTo } from "../visibility";
import type { RoomBroadcaster } from "./broadcast";
import { type HandlerCtx, replyNotFound } from "./handler-context";
import { getPhase } from "./phase";
import {
  countNoteVotes,
  countUserNoteVotes,
  hasVote,
  listVoteStickers,
} from "./votes";

export type NoteRow = {
  id: string;
  author_id: string;
  content: string;
  visibility: "private" | "shared";
  color: NoteColor;
  font_size: number;
  x: number;
  y: number;
  stack_order: number;
  created_at: string;
  updated_at: string;
  phase: number;
  excluded: boolean;
};

// 「誰の視点でもない」射影に使う viewerId。listSharedNotes や自動再編成の
// broadcast subject のように、votedByMe 等の視点依存フィールドを読まない
// 文脈でだけ使う。
export const NULL_VIEWER_ID = "00000000-0000-0000-0000-000000000000";

function normalizeNoteRow(row: Record<string, unknown>): NoteRow {
  return {
    ...(row as Omit<NoteRow, "excluded" | "font_size">),
    font_size:
      typeof row.font_size === "number"
        ? row.font_size
        : NOTE_DEFAULT_FONT_SIZE,
    excluded: row.excluded === true || row.excluded === 1,
  };
}

export function findNote(sql: SqlStorage, noteId: string): NoteRow | null {
  const rows = sql
    .exec(
      `SELECT n.*, COALESCE(a.font_size, ?2) AS font_size
       FROM notes n
       LEFT JOIN note_appearances a ON a.note_id = n.id
       WHERE n.id = ?1`,
      noteId,
      NOTE_DEFAULT_FONT_SIZE,
    )
    .toArray();
  return rows.length > 0
    ? normalizeNoteRow(rows[0] as Record<string, unknown>)
    : null;
}

export function requireNote(ctx: HandlerCtx, noteId: string): NoteRow | null {
  const row = findNote(ctx.sql, noteId);
  if (!row) {
    replyNotFound(ctx);
    return null;
  }
  return row;
}

export function requireNoteInCurrentPhase(
  ctx: HandlerCtx,
  noteId: string,
): NoteRow | null {
  const row = requireNote(ctx, noteId);
  if (!row) return null;
  const phase = getPhase(ctx.sql);
  if (phase.kind !== "step" || row.phase !== phase.phase) {
    ctx.reply({
      type: "error",
      code: "forbidden",
      message: "別のフェーズの付箋は操作できません。",
    });
    return null;
  }
  return row;
}

// shared の付箋は既存仕様どおり共同編集、private は作者だけが操作できる。
export function canEdit(row: NoteRow, userId: string): boolean {
  return canAccessNote(row, userId);
}

export function isVisibleTo(row: NoteRow, viewerId: string): boolean {
  return canAccessNote(row, viewerId);
}

// ルール本体は visibility.ts の visibleTo が持つ（一点集約）。
// ここは行形式（snake_case）を visibleTo の形へ写像するだけ。
function canAccessNote(
  row: Pick<NoteRow, "visibility" | "author_id">,
  viewerId: string,
): boolean {
  return visibleTo(
    { viewerId },
    { visibility: row.visibility, authorId: row.author_id },
  );
}

export function listNotes(
  sql: SqlStorage,
  viewerId: string,
  phase?: number,
): ProtocolNote[] {
  const rows =
    phase === undefined
      ? sql
          .exec(
            `SELECT n.*, COALESCE(a.font_size, ?1) AS font_size
             FROM notes n
             LEFT JOIN note_appearances a ON a.note_id = n.id
             ORDER BY n.created_at`,
            NOTE_DEFAULT_FONT_SIZE,
          )
          .toArray()
      : sql
          .exec(
            `SELECT n.*, COALESCE(a.font_size, ?2) AS font_size
             FROM notes n
             LEFT JOIN note_appearances a ON a.note_id = n.id
             WHERE n.phase = ?1
             ORDER BY n.created_at`,
            phase,
            NOTE_DEFAULT_FONT_SIZE,
          )
          .toArray();
  return rows.map((row) =>
    toProtocolNote(
      sql,
      normalizeNoteRow(row as Record<string, unknown>),
      viewerId,
    ),
  );
}

export function listSharedNotes(sql: SqlStorage, phase = 1): ProtocolNote[] {
  return listNotes(sql, NULL_VIEWER_ID, phase).filter(
    (note) => note.visibility === "shared",
  );
}

export function hasCandidateNotes(sql: SqlStorage, phase: number): boolean {
  const rows = sql
    .exec(
      `SELECT 1 AS found FROM notes
       WHERE phase = ?1 AND visibility = 'shared' AND excluded = 0
       LIMIT 1`,
      phase,
    )
    .toArray();
  return rows.length > 0;
}

export function hasOnlySharedNotes(
  sql: SqlStorage,
  noteIds: readonly string[],
): boolean {
  return noteIds.every((noteId) => {
    const note = findNote(sql, noteId);
    return note?.visibility === "shared" && !note.excluded;
  });
}

export function insertNote(sql: SqlStorage, note: NoteRow): void {
  sql.exec(
    `INSERT INTO notes
       (id, author_id, content, visibility, color, x, y, stack_order, created_at, updated_at, phase, excluded)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    note.id,
    note.author_id,
    note.content,
    note.visibility,
    note.color,
    note.x,
    note.y,
    note.stack_order,
    note.created_at,
    note.updated_at,
    note.phase,
    note.excluded ? 1 : 0,
  );
  sql.exec(
    `INSERT INTO note_appearances (note_id, font_size)
     VALUES (?1, ?2)`,
    note.id,
    note.font_size,
  );
}

function nextStackOrder(sql: SqlStorage): number {
  const row = sql
    .exec(
      `UPDATE room_state
       SET next_note_stack_order = next_note_stack_order + 1
       WHERE id = 1
       RETURNING next_note_stack_order - 1 AS value`,
    )
    .one() as { value: number };
  return row.value;
}

export function publishNote(
  sql: SqlStorage,
  noteId: string,
  x: number,
  y: number,
  updatedAt: string,
): number {
  const stackOrder = nextStackOrder(sql);
  sql.exec(
    `UPDATE notes
     SET visibility = 'shared', x = ?2, y = ?3, updated_at = ?4, stack_order = ?5
     WHERE id = ?1`,
    noteId,
    x,
    y,
    updatedAt,
    stackOrder,
  );
  return stackOrder;
}

export function unpublishNote(
  sql: SqlStorage,
  noteId: string,
  updatedAt: string,
): void {
  sql.exec(
    `UPDATE notes
     SET visibility = 'private', updated_at = ?2
     WHERE id = ?1`,
    noteId,
    updatedAt,
  );
}

export function updateNoteContent(
  sql: SqlStorage,
  noteId: string,
  content: string,
  updatedAt: string,
): void {
  sql.exec(
    "UPDATE notes SET content = ?2, updated_at = ?3 WHERE id = ?1",
    noteId,
    content,
    updatedAt,
  );
}

export function updateNoteFontSize(
  sql: SqlStorage,
  noteId: string,
  fontSize: number,
  updatedAt: string,
): void {
  sql.exec(
    `INSERT INTO note_appearances (note_id, font_size)
     VALUES (?1, ?2)
     ON CONFLICT(note_id) DO UPDATE SET font_size = excluded.font_size`,
    noteId,
    fontSize,
  );
  sql.exec("UPDATE notes SET updated_at = ?2 WHERE id = ?1", noteId, updatedAt);
}

export function moveNote(
  sql: SqlStorage,
  noteId: string,
  x: number,
  y: number,
  updatedAt: string,
): number {
  const row = findNote(sql, noteId);
  if (!row) return 0;
  if (row.x === x && row.y === y) {
    sql.exec(
      "UPDATE notes SET updated_at = ?2 WHERE id = ?1",
      noteId,
      updatedAt,
    );
    return row.stack_order;
  }
  const stackOrder = nextStackOrder(sql);
  sql.exec(
    `UPDATE notes
     SET x = ?2, y = ?3, updated_at = ?4, stack_order = ?5
     WHERE id = ?1`,
    noteId,
    x,
    y,
    updatedAt,
    stackOrder,
  );
  return stackOrder;
}

export function bringNoteToFront(
  sql: SqlStorage,
  noteId: string,
  updatedAt: string,
): number {
  const stackOrder = nextStackOrder(sql);
  sql.exec(
    `UPDATE notes
     SET stack_order = ?2, updated_at = ?3
     WHERE id = ?1`,
    noteId,
    stackOrder,
    updatedAt,
  );
  return stackOrder;
}

export function setNoteExcluded(
  sql: SqlStorage,
  noteId: string,
  excluded: boolean,
  updatedAt: string,
): void {
  sql.exec(
    "UPDATE notes SET excluded = ?2, updated_at = ?3 WHERE id = ?1",
    noteId,
    excluded ? 1 : 0,
    updatedAt,
  );
  sql.exec("DELETE FROM note_bulk_exclusions WHERE note_id = ?1", noteId);
}

export function listBulkExclusionCandidates(
  sql: SqlStorage,
  phase: number,
): NoteRow[] {
  return sql
    .exec(
      `SELECT n.*, COALESCE(a.font_size, ?2) AS font_size
       FROM notes n
       LEFT JOIN note_appearances a ON a.note_id = n.id
       WHERE n.phase = ?1
         AND n.visibility = 'shared'
         AND n.excluded = 0
         AND NOT EXISTS (
           SELECT 1 FROM decisions d
           WHERE d.phase = n.phase AND d.note_id = n.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM note_vote_stickers v WHERE v.note_id = n.id
         )
       ORDER BY n.created_at, n.id`,
      phase,
      NOTE_DEFAULT_FONT_SIZE,
    )
    .toArray()
    .map((row) => normalizeNoteRow(row as Record<string, unknown>));
}

// 投票完了時の自動整理では、少なくとも1件に票がある場合だけ0票候補を返す。
// 全候補が0票なら未評価の可能性を優先し、既存の手動整理へ委ねる。
export function listAutomaticExclusionCandidates(
  sql: SqlStorage,
  phase: number,
): NoteRow[] {
  const hasVotedCandidate =
    sql
      .exec(
        `SELECT 1 AS found
         FROM notes n
         WHERE n.phase = ?1
           AND n.visibility = 'shared'
           AND n.excluded = 0
           AND NOT EXISTS (
             SELECT 1 FROM decisions d
             WHERE d.phase = n.phase AND d.note_id = n.id
           )
           AND EXISTS (
             SELECT 1 FROM note_vote_stickers v WHERE v.note_id = n.id
           )
         LIMIT 1`,
        phase,
      )
      .toArray().length > 0;
  return hasVotedCandidate ? listBulkExclusionCandidates(sql, phase) : [];
}

export function excludeNotesForBulkOperation(
  sql: SqlStorage,
  noteIds: readonly string[],
  operationId: string,
  updatedAt: string,
): void {
  for (const noteId of noteIds) {
    sql.exec(
      "UPDATE notes SET excluded = 1, updated_at = ?2 WHERE id = ?1",
      noteId,
      updatedAt,
    );
    sql.exec(
      `INSERT INTO note_bulk_exclusions (note_id, operation_id)
       VALUES (?1, ?2)
       ON CONFLICT(note_id) DO UPDATE SET operation_id = excluded.operation_id`,
      noteId,
      operationId,
    );
  }
}

export function listBulkRestoreTargets(
  sql: SqlStorage,
  phase: number,
  operationId: string,
): NoteRow[] {
  return sql
    .exec(
      `SELECT n.*, COALESCE(a.font_size, ?3) AS font_size
       FROM notes n
       LEFT JOIN note_appearances a ON a.note_id = n.id
       INNER JOIN note_bulk_exclusions b ON b.note_id = n.id
       WHERE n.phase = ?1 AND n.visibility = 'shared' AND n.excluded = 1
         AND b.operation_id = ?2
       ORDER BY n.created_at, n.id`,
      phase,
      operationId,
      NOTE_DEFAULT_FONT_SIZE,
    )
    .toArray()
    .map((row) => normalizeNoteRow(row as Record<string, unknown>));
}

export function restoreNotesForBulkOperation(
  sql: SqlStorage,
  noteIds: readonly string[],
  updatedAt: string,
): void {
  for (const noteId of noteIds) {
    sql.exec(
      "UPDATE notes SET excluded = 0, updated_at = ?2 WHERE id = ?1",
      noteId,
      updatedAt,
    );
    sql.exec("DELETE FROM note_bulk_exclusions WHERE note_id = ?1", noteId);
  }
}

export function deleteNote(sql: SqlStorage, noteId: string): void {
  sql.exec("DELETE FROM note_bulk_exclusions WHERE note_id = ?1", noteId);
  sql.exec("DELETE FROM note_appearances WHERE note_id = ?1", noteId);
  sql.exec("DELETE FROM notes WHERE id = ?1", noteId);
}

// updated_at だけを進める（投票の変化を note:updated として配信するため）。
export function touchNote(
  sql: SqlStorage,
  noteId: string,
  updatedAt: string,
): void {
  sql.exec("UPDATE notes SET updated_at = ?2 WHERE id = ?1", noteId, updatedAt);
}

export function toProtocolNote(
  sql: SqlStorage,
  row: NoteRow,
  viewerId: string,
): ProtocolNote {
  const phase = getPhase(sql);
  return {
    id: row.id,
    authorId: row.author_id,
    content: row.content,
    visibility: row.visibility,
    color: row.color,
    fontSize: row.font_size,
    x: row.x,
    y: row.y,
    excluded: row.excluded,
    stackOrder: row.stack_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dotVotes: {
      subjective: {
        count: countNoteVotes(sql, row.id, "subjective"),
        votedByMe: hasVote(sql, row.id, viewerId, "subjective"),
        ownCount: countUserNoteVotes(sql, row.id, viewerId, "subjective"),
      },
      objective: {
        count: countNoteVotes(sql, row.id, "objective"),
        votedByMe: hasVote(sql, row.id, viewerId, "objective"),
        ownCount: countUserNoteVotes(sql, row.id, viewerId, "objective"),
      },
    },
    dotVoteStickers: isVotingStep(phase)
      ? listVoteStickers(sql, row.id, viewerId)
      : listVoteStickers(sql, row.id),
  };
}

export function broadcastNoteInserted(
  sql: SqlStorage,
  broadcaster: RoomBroadcaster,
  row: NoteRow,
): void {
  const phase = getPhase(sql);
  broadcaster.broadcastNote((viewerId) => ({
    type: "note:inserted",
    note: projectNoteForViewer(
      { viewerId, phase },
      toProtocolNote(sql, row, viewerId),
    ),
  }));
}

export function broadcastNoteUpdated(
  sql: SqlStorage,
  broadcaster: RoomBroadcaster,
  row: NoteRow,
): void {
  const phase = getPhase(sql);
  broadcaster.broadcastNote((viewerId) => ({
    type: "note:updated",
    note: projectNoteForViewer(
      { viewerId, phase },
      toProtocolNote(sql, row, viewerId),
    ),
  }));
}

// 投票ステップでは、投票者本人（同一アカウントの全接続）に限定する。
// 他メンバーへイベント自体を配信しないことで、票数だけでなく投票タイミングも
// WebSocket から推測できないようにする。投票工程外は既存どおり全員へ同期する。
export function broadcastVoteUpdated(
  sql: SqlStorage,
  broadcaster: RoomBroadcaster,
  row: NoteRow,
  userId: string,
  operationId?: string,
): void {
  const phase = getPhase(sql);
  if (!isVotingStep(phase)) {
    broadcastNoteUpdated(sql, broadcaster, row);
    return;
  }

  broadcaster.broadcastNoteToUser(userId, (viewerId) => ({
    type: "note:updated",
    note: projectNoteForViewer(
      { viewerId, phase },
      toProtocolNote(sql, row, viewerId),
    ),
    ...(operationId === undefined ? {} : { operationId }),
  }));
}
