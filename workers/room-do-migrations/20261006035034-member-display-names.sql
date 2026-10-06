-- 退出後も同じ未完了ルームへの再参加で呼び名を復元する。
-- members の削除とは独立し、ルームの期限・削除で一緒に消す。
CREATE TABLE member_display_names (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 40)
);
