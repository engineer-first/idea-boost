-- ゲストはメールを持たないため users を再作成する。参照先の名前を変えず、
-- DROP の CASCADE で消える権限を退避・復元して既存の本人情報と参照を守る。
PRAGMA defer_foreign_keys = true;
CREATE TABLE guest_users_permissions_backup AS
  SELECT user_id, permission, created_at FROM user_permissions;
CREATE TABLE users_next (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  google_sub TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  display_name TEXT,
  display_name_revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO users_next (id, email, name, google_sub, created_at, display_name, display_name_revision)
  SELECT id, email, name, google_sub, created_at, display_name, display_name_revision FROM users;
DROP TABLE users;
ALTER TABLE users_next RENAME TO users;
INSERT OR IGNORE INTO user_permissions (user_id, permission, created_at)
  SELECT user_id, permission, created_at FROM guest_users_permissions_backup;
DROP TABLE guest_users_permissions_backup;
-- defer_foreign_keys を戻す前に参照整合性を検査し、違反があれば移行全体を失敗させる。
CREATE TABLE guest_users_fk_check (valid INTEGER CHECK (valid = 1));
INSERT INTO guest_users_fk_check SELECT 0 FROM pragma_foreign_key_check;
DROP TABLE guest_users_fk_check;
PRAGMA defer_foreign_keys = false;
