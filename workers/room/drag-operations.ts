// WebSocket attachment だけでは再接続時に失われるため、現在フェーズ内の
// dragId を SQLite に保持する。フェーズ境界で全件破棄し、同一フェーズ内も
// ユーザーごとの直近件数へ絞ってストレージ増加を有界にする。

export const MAX_USED_NOTE_DRAG_IDS_PER_USER = 256;
export const NOTE_DRAG_START_RATE_LIMIT_PER_MINUTE = 60;

export function hasUsedNoteDragId(
  sql: SqlStorage,
  userId: string,
  dragId: string,
): boolean {
  return (
    sql
      .exec(
        `SELECT 1
         FROM used_note_drag_ids
         WHERE user_id = ?1 AND drag_id = ?2
         LIMIT 1`,
        userId,
        dragId,
      )
      .toArray().length > 0
  );
}

export function recordUsedNoteDragId(
  sql: SqlStorage,
  userId: string,
  dragId: string,
): void {
  sql.exec(
    `INSERT OR IGNORE INTO used_note_drag_ids (user_id, drag_id)
     VALUES (?1, ?2)`,
    userId,
    dragId,
  );
  sql.exec(
    `DELETE FROM used_note_drag_ids
     WHERE user_id = ?1
       AND rowid NOT IN (
         SELECT rowid
         FROM used_note_drag_ids
         WHERE user_id = ?1
         ORDER BY rowid DESC
         LIMIT ?2
       )`,
    userId,
    MAX_USED_NOTE_DRAG_IDS_PER_USER,
  );
}

export function hasReachedNoteDragStartRateLimit(
  sql: SqlStorage,
  userId: string,
): boolean {
  const row = sql
    .exec(
      `SELECT COUNT(*) AS count
       FROM used_note_drag_ids
       WHERE user_id = ?1
         AND created_at >= datetime('now', '-1 minute')`,
      userId,
    )
    .toArray()[0] as { count: number };
  return row.count >= NOTE_DRAG_START_RATE_LIMIT_PER_MINUTE;
}

export function clearUsedNoteDragIds(sql: SqlStorage): void {
  sql.exec("DELETE FROM used_note_drag_ids");
}
