-- 通常進行の直前状態。RoomDO 内だけに保持し、下書きを外部投影しない。
-- 機能廃止時は新規 migration でこのテーブルを DROP できる。
CREATE TABLE phase_rollback_checkpoints (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 phase_json TEXT NOT NULL,
 snapshot_json TEXT NOT NULL
);

-- 実際の後戻りも訪問履歴として記録するためactionを拡張。
ALTER TABLE progress_history RENAME TO progress_history_before_rollback;
ALTER TABLE progress_history_outbox RENAME TO progress_history_outbox_before_rollback;
CREATE TABLE progress_history (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 phase_json TEXT NOT NULL,
 next_phase_json TEXT,
 action TEXT CHECK(action IN ('next','restart-writing','revote','rollback','complete')),
 entered_at INTEGER,
 exited_at INTEGER,
 save_status TEXT NOT NULL CHECK(save_status IN ('open','pending','failed','saved','missing')),
 reflected_at INTEGER
);
INSERT INTO progress_history SELECT * FROM progress_history_before_rollback;
CREATE TABLE progress_history_outbox (
 record_id TEXT PRIMARY KEY REFERENCES progress_history(id) ON DELETE CASCADE,
 snapshot_json TEXT NOT NULL,
 retry_at INTEGER
);
INSERT INTO progress_history_outbox SELECT * FROM progress_history_outbox_before_rollback;
DROP TABLE progress_history_outbox_before_rollback;
DROP TABLE progress_history_before_rollback;
CREATE INDEX progress_history_retry ON progress_history_outbox(retry_at);

-- 切断中の端末も過去本文の自動再送を止められるよう復元世代を永続化。
ALTER TABLE room_state ADD COLUMN rollback_revision INTEGER NOT NULL DEFAULT 0;
