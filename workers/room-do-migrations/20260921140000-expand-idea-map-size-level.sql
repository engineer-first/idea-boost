-- 1回あたりの広さ変更を20%から10%へ細かくしたため、最大寸法をほぼ維持したまま
-- サイズ段階を0〜15へ広げる。SQLiteは列のCHECK制約だけを変更できないため、
-- room_stateを同じデータのまま作り直す。
ALTER TABLE room_state RENAME TO room_state_before_idea_map_size_level_expansion;

CREATE TABLE room_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  phase TEXT NOT NULL DEFAULT 'phase1',
  next_note_stack_order INTEGER NOT NULL DEFAULT 0
    CHECK (next_note_stack_order >= 0),
  idea_map_size_level INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(idea_map_size_level) = 'integer' AND idea_map_size_level BETWEEN 0 AND 15),
  idea_map_size_initialized INTEGER NOT NULL DEFAULT 0
    CHECK (idea_map_size_initialized IN (0, 1))
);

INSERT INTO room_state (
  id,
  phase,
  next_note_stack_order,
  idea_map_size_level,
  idea_map_size_initialized
)
SELECT
  id,
  phase,
  next_note_stack_order,
  idea_map_size_level,
  idea_map_size_initialized
FROM room_state_before_idea_map_size_level_expansion;

DROP TABLE room_state_before_idea_map_size_level_expansion;
