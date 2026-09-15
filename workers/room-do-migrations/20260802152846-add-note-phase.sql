-- 付箋を作成したマクロフェーズに分離する。
-- 既存の付箋は従来の課題整理（フェーズ1）の成果物として扱う。
ALTER TABLE notes ADD COLUMN phase INTEGER NOT NULL DEFAULT 1;
