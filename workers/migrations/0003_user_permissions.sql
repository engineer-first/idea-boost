CREATE TABLE user_permissions (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('shared_outcomes:read', 'shared_outcomes:manage_access')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX user_permissions_permission_idx ON user_permissions (permission);
