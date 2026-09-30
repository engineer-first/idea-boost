-- 意見は共有状態とは別の任意投稿。解散後も保持し、投稿者属性は保存しない。
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  id_hash TEXT NOT NULL,
  room_id TEXT NOT NULL,
  target TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bug','difficult','want','good')),
  body TEXT NOT NULL CHECK (length(body) <= 2000),
  rating INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5 AND target = 'app')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX feedback_recent ON feedback(created_at DESC, id DESC);
CREATE INDEX feedback_expiry ON feedback(expires_at);
CREATE INDEX feedback_filter ON feedback(kind, target, created_at DESC, id DESC);

-- 失効登録と本文削除を1つのSQL文で行う。失効表に原文・ルーム・投稿者は残さない。
CREATE INDEX feedback_id_hash ON feedback(id_hash);
CREATE TABLE feedback_revocations (
  id_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX feedback_revocations_expiry ON feedback_revocations(expires_at);
CREATE TRIGGER feedback_revoke_delete AFTER INSERT ON feedback_revocations
BEGIN
  DELETE FROM feedback WHERE id_hash = NEW.id_hash;
END;
-- INSERTと失効判定を同じ文で実行し、削除と投稿のどちらが先でも復活させない。
CREATE TRIGGER feedback_reject_revoked BEFORE INSERT ON feedback
WHEN EXISTS (SELECT 1 FROM feedback_revocations WHERE id_hash = NEW.id_hash)
BEGIN
  SELECT RAISE(IGNORE);
END;

-- 既存の権限を維持し、独立した意見閲覧権限を許可する。
CREATE TABLE user_permissions_next (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('shared_outcomes:read','shared_outcomes:manage_access','feedback:read')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, permission)
);
INSERT INTO user_permissions_next SELECT user_id, permission, created_at FROM user_permissions;
DROP TABLE user_permissions;
ALTER TABLE user_permissions_next RENAME TO user_permissions;
CREATE INDEX user_permissions_permission_idx ON user_permissions(permission);
