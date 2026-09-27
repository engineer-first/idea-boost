-- 既存の保存確認記録に残った過去本文を破棄する。欠落した ACK の照会は unknown となり、
-- クライアントは本文版を再確認するため、競合時にも未反映の文章を保持できる。
DROP TABLE note_content_receipts;
CREATE TABLE note_content_receipts (
  operation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  expected_content_revision INTEGER NOT NULL,
  expected_phase_revision INTEGER NOT NULL,
  content_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX note_content_receipts_user_id ON note_content_receipts (user_id, operation_id);
