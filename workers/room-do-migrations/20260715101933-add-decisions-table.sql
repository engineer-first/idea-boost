-- フェーズごとのホスト確定。再確定は同じ phase 行を上書きする。
CREATE TABLE IF NOT EXISTS decisions (
  phase INTEGER PRIMARY KEY,
  note_id TEXT NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL
);
