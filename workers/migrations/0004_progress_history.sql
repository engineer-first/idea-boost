-- ルームの解散に連動させず、共有成果と同じ期限で削除する。
CREATE TABLE progress_history_snapshots (
 room_id TEXT NOT NULL,
 record_id TEXT NOT NULL,
 snapshot_json TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 PRIMARY KEY(room_id, record_id)
);
CREATE INDEX progress_history_snapshots_expiry ON progress_history_snapshots(expires_at);
