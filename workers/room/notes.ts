// 付箋（notes）の真実。ストレージアクセス・可視性判定・プロトコル射影と、
// 受信者ごとの可視性を踏まえたノート配信ヘルパをここに集約する。

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
  x: number;
  y: number;
  created_at: string;
  updated_at: string;
  phase: number;
};

// 「誰の視点でもない」射影に使う viewerId。listSharedNotes や自動再編成の
// broadcast subject のように、votedByMe 等の視点依存フィールドを読まない
// 文脈でだけ使う。
export const NULL_VIEWER_ID = "00000000-0000-0000-0000-000000000000";

export function findNote(sql: SqlStorage, noteId: string): NoteRow | null {
  const rows = sql.exec("SELECT * FROM notes WHERE id = ?1", noteId).toArray();
  return rows.length > 0 ? (rows[0] as unknown as NoteRow) : null;
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
      ? sql.exec("SELECT * FROM notes ORDER BY created_at").toArray()
      : sql
          .exec(
            "SELECT * FROM notes WHERE phase = ?1 ORDER BY created_at",
            phase,
          )
          .toArray();
  return rows.map((row) =>
    toProtocolNote(sql, row as unknown as NoteRow, viewerId),
  );
}

export function listSharedNotes(sql: SqlStorage, phase = 1): ProtocolNote[] {
  return listNotes(sql, NULL_VIEWER_ID, phase).filter(
    (note) => note.visibility === "shared",
  );
}

export function hasOnlySharedNotes(
  sql: SqlStorage,
  noteIds: readonly string[],
): boolean {
  return noteIds.every(
    (noteId) => findNote(sql, noteId)?.visibility === "shared",
  );
}

export function insertNote(sql: SqlStorage, note: NoteRow): void {
  sql.exec(
    `INSERT INTO notes
       (id, author_id, content, visibility, color, x, y, created_at, updated_at, phase)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    note.id,
    note.author_id,
    note.content,
    note.visibility,
    note.color,
    note.x,
    note.y,
    note.created_at,
    note.updated_at,
    note.phase,
  );
}

export function publishNote(
  sql: SqlStorage,
  noteId: string,
  x: number,
  y: number,
  updatedAt: string,
): void {
  sql.exec(
    `UPDATE notes
     SET visibility = 'shared', x = ?2, y = ?3, updated_at = ?4
     WHERE id = ?1`,
    noteId,
    x,
    y,
    updatedAt,
  );
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

export function moveNote(
  sql: SqlStorage,
  noteId: string,
  x: number,
  y: number,
  updatedAt: string,
): void {
  sql.exec(
    "UPDATE notes SET x = ?2, y = ?3, updated_at = ?4 WHERE id = ?1",
    noteId,
    x,
    y,
    updatedAt,
  );
}

export function deleteNote(sql: SqlStorage, noteId: string): void {
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
    x: row.x,
    y: row.y,
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
