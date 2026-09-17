-- WebSocket の切断・再接続をまたいで、一度受理した付箋 dragId の
-- replay を拒否する。ユーザーが退出してもルーム寿命中は残すため FK は持たない。
CREATE TABLE used_note_drag_ids (
  user_id TEXT NOT NULL,
  drag_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, drag_id)
);
