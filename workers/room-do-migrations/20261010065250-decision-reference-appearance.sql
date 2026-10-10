-- 採用本文は既存のコピーを保持し、外観と集計だけを元付箋から復元する。
-- 元付箋がない場合の NULL は、復元できない値を推測しないための印。
ALTER TABLE decisions ADD COLUMN note_color TEXT;
ALTER TABLE decisions ADD COLUMN note_font_size INTEGER
  CHECK (note_font_size IS NULL OR (typeof(note_font_size) = 'integer' AND note_font_size BETWEEN 12 AND 24));
ALTER TABLE decisions ADD COLUMN subjective_votes INTEGER
  CHECK (subjective_votes IS NULL OR (typeof(subjective_votes) = 'integer' AND subjective_votes >= 0));
ALTER TABLE decisions ADD COLUMN objective_votes INTEGER
  CHECK (objective_votes IS NULL OR (typeof(objective_votes) = 'integer' AND objective_votes >= 0));

UPDATE decisions
SET note_color = (SELECT color FROM notes WHERE id = decisions.note_id),
    note_font_size = (
      SELECT COALESCE(a.font_size, 14) FROM notes n
      LEFT JOIN note_appearances a ON a.note_id = n.id
      WHERE n.id = decisions.note_id
    ),
    subjective_votes = (
      SELECT COUNT(*) FROM note_vote_stickers
      WHERE note_id = decisions.note_id AND kind = 'subjective'
    ),
    objective_votes = (
      SELECT COUNT(*) FROM note_vote_stickers
      WHERE note_id = decisions.note_id AND kind = 'objective'
    )
WHERE EXISTS (SELECT 1 FROM notes WHERE id = decisions.note_id);
