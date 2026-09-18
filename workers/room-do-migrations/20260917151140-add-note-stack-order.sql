-- 共有付箋の確定した重なり順を RoomDO に永続化する。
-- 既存行は created_at と id の安定した順序で 0 始まりの一意な値を割り当てる。
ALTER TABLE notes ADD COLUMN stack_order INTEGER NOT NULL DEFAULT 0
  CHECK (stack_order >= 0);

ALTER TABLE room_state ADD COLUMN next_note_stack_order INTEGER NOT NULL DEFAULT 0
  CHECK (next_note_stack_order >= 0);

WITH ranked_notes AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) - 1 AS stack_order
  FROM notes
)
UPDATE notes
SET stack_order = (
  SELECT ranked_notes.stack_order
  FROM ranked_notes
  WHERE ranked_notes.id = notes.id
);

UPDATE room_state
SET next_note_stack_order = COALESCE(
  (SELECT MAX(stack_order) + 1 FROM notes),
  0
)
WHERE id = 1;
