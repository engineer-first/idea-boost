-- 削除せず、元の内容・票・座標・グループを保持したまま候補外にする。
-- 既存の付箋は候補として扱う。
ALTER TABLE notes ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0
  CHECK (excluded IN (0, 1));
