-- 一括候補外の由来を付箋ごとに記録し、その操作だけを安全に Undo する。
-- 個別操作や後続の一括操作がこの値を上書き・消去するため、古い Undo は
-- 現在も同じ操作由来で候補外の行にだけ作用する。
CREATE TABLE note_bulk_exclusions (
  note_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL
);

CREATE INDEX idx_note_bulk_exclusions_operation
  ON note_bulk_exclusions (operation_id);
