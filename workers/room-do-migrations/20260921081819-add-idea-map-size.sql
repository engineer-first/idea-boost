-- 2軸マップのサイズ段階と初回自動設定済み状態をルームごとに保存する。
-- 既存ルームは現行の基準寸法から始め、3-1 から 3-2 へ進むときに一度だけ再計算する。
ALTER TABLE room_state ADD COLUMN idea_map_size_level INTEGER NOT NULL DEFAULT 0
  CHECK (typeof(idea_map_size_level) = 'integer' AND idea_map_size_level BETWEEN 0 AND 8);
ALTER TABLE room_state ADD COLUMN idea_map_size_initialized INTEGER NOT NULL DEFAULT 0
  CHECK (idea_map_size_initialized IN (0, 1));
