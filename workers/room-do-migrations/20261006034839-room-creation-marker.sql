-- 工程・参加者とは独立した一度だけの初期化記録。解散・期限後も残す。
CREATE TABLE room_creation_marker (
  id INTEGER PRIMARY KEY CHECK(id=1),
  host_id TEXT NOT NULL,
  closed INTEGER NOT NULL DEFAULT 0 CHECK(closed IN (0, 1))
);
