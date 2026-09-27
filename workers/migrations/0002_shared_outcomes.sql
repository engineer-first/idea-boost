-- ルームディレクトリから独立させ、退出・解散後も期限まで成果を保持する。
CREATE TABLE shared_outcomes (
  room_id TEXT PRIMARY KEY,
  last_used_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  snapshot_json TEXT
);
CREATE INDEX shared_outcomes_recent ON shared_outcomes(last_used_at DESC, room_id);
CREATE INDEX shared_outcomes_expiry ON shared_outcomes(expires_at);
