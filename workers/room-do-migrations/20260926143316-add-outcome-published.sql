-- 採用案の決定と成果画面の公開を分け、公開済み状態を再接続後も復元する。
ALTER TABLE room_state ADD COLUMN outcome_published INTEGER NOT NULL DEFAULT 0 CHECK (outcome_published IN (0, 1));
