-- 訪問順の時刻正本。本文は独立outboxへ分離し、完了記録は既存成果を参照する。
CREATE TABLE progress_history (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE,
 phase_json TEXT NOT NULL,
 next_phase_json TEXT,
 action TEXT CHECK(action IN ('next','restart-writing','revote','complete')),
 entered_at INTEGER,
 exited_at INTEGER,
 save_status TEXT NOT NULL CHECK(save_status IN ('open','pending','failed','saved','missing')),
 reflected_at INTEGER
);
CREATE TABLE progress_history_outbox (
 record_id TEXT PRIMARY KEY REFERENCES progress_history(id) ON DELETE CASCADE,
 snapshot_json TEXT NOT NULL,
 retry_at INTEGER
);
CREATE INDEX progress_history_retry ON progress_history_outbox(retry_at);
