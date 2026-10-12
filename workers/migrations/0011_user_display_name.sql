-- Google名とは別に、本人が選んだ表示名を保存する。
ALTER TABLE users ADD COLUMN display_name TEXT;
-- 同じルームへの更新が逆順に届いても、古い名前へ戻さないための更新番号。
ALTER TABLE users ADD COLUMN display_name_revision INTEGER NOT NULL DEFAULT 0;
