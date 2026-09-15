// ドット投票（note_vote_stickers）の真実。シール単位で保存し、票数が必要な
// 既存UI向けにはこのモジュールで集計する。書き込みも必ずここを通す。
import {
  DOT_VOTE_LIMITS,
  type DotVoteKind,
  type DotVoteSticker,
} from "../../contracts/room-protocol";

type VoteStickerRow = DotVoteSticker & {
  note_id: string;
  user_id: string;
  created_at: string;
};

export function hasVote(
  sql: SqlStorage,
  noteId: string,
  userId: string,
  kind: DotVoteKind,
): boolean {
  return countUserNoteVotes(sql, noteId, userId, kind) > 0;
}

export function countUserNoteVotes(
  sql: SqlStorage,
  noteId: string,
  userId: string,
  kind: DotVoteKind,
): number {
  const rows = sql
    .exec(
      `SELECT COUNT(*) AS count FROM note_vote_stickers
       WHERE note_id = ?1 AND user_id = ?2 AND kind = ?3`,
      noteId,
      userId,
      kind,
    )
    .toArray();
  return Number(rows[0]?.count ?? 0);
}

export function countUserVotes(
  sql: SqlStorage,
  userId: string,
  kind: DotVoteKind,
  phase: number,
): number {
  const rows = sql
    .exec(
      `SELECT COUNT(*) AS count
       FROM note_vote_stickers v
       INNER JOIN notes n ON n.id = v.note_id
       WHERE v.user_id = ?1 AND v.kind = ?2 AND n.phase = ?3`,
      userId,
      kind,
      phase,
    )
    .toArray();
  return Number(rows[0]?.count ?? 0);
}

export function countNoteVotes(
  sql: SqlStorage,
  noteId: string,
  kind: DotVoteKind,
): number {
  const rows = sql
    .exec(
      "SELECT COUNT(*) AS count FROM note_vote_stickers WHERE note_id = ?1 AND kind = ?2",
      noteId,
      kind,
    )
    .toArray();
  return Number(rows[0]?.count ?? 0);
}

// 投票中は受信者本人のシールだけ、結果では全シールを返す呼び出し方にする。
// user_id はプロトコルへ写さないため、投票者の特定情報はブラウザへ流れない。
export function listVoteStickers(
  sql: SqlStorage,
  noteId: string,
  userId?: string,
): DotVoteSticker[] {
  const rows =
    userId === undefined
      ? sql
          .exec(
            `SELECT id, kind, x, y FROM note_vote_stickers
             WHERE note_id = ?1 ORDER BY created_at, id`,
            noteId,
          )
          .toArray()
      : sql
          .exec(
            `SELECT id, kind, x, y FROM note_vote_stickers
             WHERE note_id = ?1 AND user_id = ?2 ORDER BY created_at, id`,
            noteId,
            userId,
          )
          .toArray();
  return rows.map((row) => ({
    id: String(row.id),
    kind: row.kind as DotVoteKind,
    x: Number(row.x),
    y: Number(row.y),
  }));
}

export function findVoteSticker(
  sql: SqlStorage,
  stickerId: string,
): VoteStickerRow | null {
  const rows = sql
    .exec(
      `SELECT id, note_id, user_id, kind, x, y, created_at
       FROM note_vote_stickers WHERE id = ?1`,
      stickerId,
    )
    .toArray();
  return rows.length === 0 ? null : (rows[0] as unknown as VoteStickerRow);
}

export function hasReachedVoteLimit(
  sql: SqlStorage,
  userId: string,
  kind: DotVoteKind,
  phase: number,
): boolean {
  return countUserVotes(sql, userId, kind, phase) >= DOT_VOTE_LIMITS[kind];
}

export function addVoteSticker(
  sql: SqlStorage,
  sticker: DotVoteSticker,
  noteId: string,
  userId: string,
): boolean {
  if (findVoteSticker(sql, sticker.id) !== null) return false;
  sql.exec(
    `INSERT INTO note_vote_stickers (id, note_id, user_id, kind, x, y, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    sticker.id,
    noteId,
    userId,
    sticker.kind,
    sticker.x,
    sticker.y,
    new Date().toISOString(),
  );
  return true;
}

export function moveVoteSticker(
  sql: SqlStorage,
  stickerId: string,
  noteId: string,
  x: number,
  y: number,
): void {
  sql.exec(
    `UPDATE note_vote_stickers SET note_id = ?2, x = ?3, y = ?4
     WHERE id = ?1`,
    stickerId,
    noteId,
    x,
    y,
  );
}

export function removeVoteSticker(sql: SqlStorage, stickerId: string): void {
  sql.exec("DELETE FROM note_vote_stickers WHERE id = ?1", stickerId);
}

// 旧クリッククライアントの操作も、同じ個別シールの真実へ収容する。新UIは
// note:vote-sticker:add を使うため、この座標は過渡的な互換値である。
export function addUserNoteVote(
  sql: SqlStorage,
  noteId: string,
  userId: string,
  kind: DotVoteKind,
): void {
  const ordinal = countUserNoteVotes(sql, noteId, userId, kind);
  addVoteSticker(
    sql,
    {
      id: crypto.randomUUID(),
      kind,
      x: kind === "subjective" ? 0.82 : Math.min(0.93, 0.72 + ordinal * 0.08),
      y: 0.16,
    },
    noteId,
    userId,
  );
}

// あるユーザーの kind の票をその付箋からすべて取り除く。
export function removeUserNoteVotes(
  sql: SqlStorage,
  noteId: string,
  userId: string,
  kind: DotVoteKind,
): void {
  sql.exec(
    `DELETE FROM note_vote_stickers
     WHERE note_id = ?1 AND user_id = ?2 AND kind = ?3`,
    noteId,
    userId,
    kind,
  );
}

// あるユーザーの kind の票をその付箋から1票だけ取り除く。
export function removeOneUserNoteVote(
  sql: SqlStorage,
  noteId: string,
  userId: string,
  kind: DotVoteKind,
): boolean {
  const rows = sql
    .exec(
      `SELECT id FROM note_vote_stickers
       WHERE note_id = ?1 AND user_id = ?2 AND kind = ?3
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      noteId,
      userId,
      kind,
    )
    .toArray();
  const stickerId = rows[0]?.id;
  if (typeof stickerId !== "string") return false;
  removeVoteSticker(sql, stickerId);
  return true;
}

// 付箋削除時に紐づく票をすべて消す。
export function deleteNoteVotes(sql: SqlStorage, noteId: string): void {
  sql.exec("DELETE FROM note_vote_stickers WHERE note_id = ?1", noteId);
  // migration 前の古い値が残っている壊れたローカル状態も、付箋削除時には残さない。
  sql.exec("DELETE FROM note_votes WHERE note_id = ?1", noteId);
}

// 全メンバーが主観・客観とも上限まで投票し終えたか。
export function haveAllMembersCompletedVoting(
  sql: SqlStorage,
  phase: number,
): boolean {
  const rows = sql
    .exec(
      `SELECT m.user_id
       FROM members m
       LEFT JOIN (
         SELECT v.user_id, v.kind, COUNT(*) AS vote_count
         FROM note_vote_stickers v
         INNER JOIN notes n ON n.id = v.note_id
         WHERE n.phase = ?1
         GROUP BY v.user_id, v.kind
       ) v ON v.user_id = m.user_id
       GROUP BY m.user_id
       HAVING COALESCE(SUM(CASE WHEN v.kind = 'subjective' THEN v.vote_count END), 0) != ?2
           OR COALESCE(SUM(CASE WHEN v.kind = 'objective' THEN v.vote_count END), 0) != ?3`,
      phase,
      DOT_VOTE_LIMITS.subjective,
      DOT_VOTE_LIMITS.objective,
    )
    .toArray();
  return rows.length === 0;
}
