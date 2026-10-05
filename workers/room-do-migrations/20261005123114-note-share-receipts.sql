CREATE TABLE note_share_operations (
  operation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX note_share_operations_user ON note_share_operations(user_id, created_at);
