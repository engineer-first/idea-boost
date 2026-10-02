-- 種類「わからない」を追加する。既存投稿・保存期限・失効記録を維持する。
-- SQLite の CHECK 制約を変更するため、投稿テーブルだけを再作成する。
DROP TRIGGER feedback_revoke_delete;
DROP TRIGGER feedback_reject_revoked;

CREATE TABLE feedback_next (
  id TEXT PRIMARY KEY,
  id_hash TEXT NOT NULL,
  room_id TEXT NOT NULL,
  target TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bug','difficult','unclear','want','good')),
  body TEXT NOT NULL CHECK (length(body) <= 2000),
  rating INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5 AND target = 'app')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
INSERT INTO feedback_next SELECT id, id_hash, room_id, target, kind, body, rating, created_at, expires_at FROM feedback;
DROP TABLE feedback;
ALTER TABLE feedback_next RENAME TO feedback;
CREATE INDEX feedback_recent ON feedback(created_at DESC, id DESC);
CREATE INDEX feedback_expiry ON feedback(expires_at);
CREATE INDEX feedback_filter ON feedback(kind, target, created_at DESC, id DESC);
CREATE INDEX feedback_id_hash ON feedback(id_hash);

CREATE TRIGGER feedback_revoke_delete AFTER INSERT ON feedback_revocations
BEGIN
  DELETE FROM feedback WHERE id_hash = NEW.id_hash;
END;
CREATE TRIGGER feedback_reject_revoked BEFORE INSERT ON feedback
WHEN EXISTS (SELECT 1 FROM feedback_revocations WHERE id_hash = NEW.id_hash)
BEGIN
  SELECT RAISE(IGNORE);
END;
