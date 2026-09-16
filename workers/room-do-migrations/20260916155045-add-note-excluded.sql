-- 付箋を削除せずに候補から一時除外する。既存の共有成果物は
-- 「除外されていない」として後方互換に扱う。
ALTER TABLE notes ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0
  CHECK (excluded IN (0, 1));
