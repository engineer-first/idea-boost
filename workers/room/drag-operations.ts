// 一度受理した付箋 dragId をルームの寿命中保持する。
// WebSocket attachment だけでは再接続時に失われるため、RoomDO の
// SQLite を user_id + drag_id の一意性の真実とする。

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
}
