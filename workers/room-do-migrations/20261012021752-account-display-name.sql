-- APIからの新旧の表示名更新が逆順に届いても巻き戻さない。
-- 初期のGoogle名・本人の選んだ名前・保存済み記録には触れない。
CREATE TABLE member_account_name_revisions (
  user_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL
);
