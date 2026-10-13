-- 工程ごとの参加者本人による完了状態と、保存猶予中の進行判定世代。
CREATE TABLE phase_progress_ready (
  phase_revision INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  ready INTEGER NOT NULL CHECK (ready IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (phase_revision, user_id)
);

ALTER TABLE room_state ADD COLUMN progress_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pending_phase_transition ADD COLUMN confirmed_progress_revision INTEGER;
