-- 最後の切断からの期限を保持する。接続・在籍の真実はRoomDOだけが持つ。
CREATE TABLE room_idle_deadline (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  expires_at INTEGER NOT NULL
);
