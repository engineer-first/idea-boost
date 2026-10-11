-- Googleプロフィール名からは移さず、本人が選ぶまで未設定とする。
-- 復旧時もnameへのコピーはしない。呼び名の削除は別途明示した作業で行う。
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN display_name_revision INTEGER NOT NULL DEFAULT 0;

-- 参加ルームの候補索引。現在の在籍・改名可否の権威はRoomDOのまま。
CREATE TABLE user_display_name_rooms (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, room_id)
);
CREATE INDEX user_display_name_rooms_room ON user_display_name_rooms(room_id);
-- 導入前ルームの索引化を定期処理で少しずつ行うための進捗。
CREATE TABLE display_name_indexed_rooms (
  room_id TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE
);
