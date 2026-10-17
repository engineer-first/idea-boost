-- 2軸マップで共有付箋が未配置かどうかを保存する。
-- 既存行は配置済みとして扱い、配置状態だけの変更も古い移動操作を無効にする。
ALTER TABLE notes
ADD COLUMN idea_map_placed INTEGER NOT NULL DEFAULT 1
CHECK (idea_map_placed IN (0, 1));

CREATE TRIGGER note_idea_map_placement_revision
AFTER UPDATE OF idea_map_placed ON notes
WHEN OLD.idea_map_placed <> NEW.idea_map_placed
  AND OLD.x IS NEW.x
  AND OLD.y IS NEW.y
BEGIN
  INSERT INTO note_move_versions (note_id, position_revision)
  VALUES (NEW.id, 1)
  ON CONFLICT(note_id) DO UPDATE
  SET position_revision = position_revision + 1;
END;
