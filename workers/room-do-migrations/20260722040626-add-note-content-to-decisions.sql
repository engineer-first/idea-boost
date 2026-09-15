-- 決定時点の付箋内容を decisions に保持する。
-- 持ち越し表示（フェーズ2以降での前フェーズ決定の固定表示）は元付箋の
-- 後からの編集・削除に影響されない確定情報として扱うため、参照ではなく
-- コピーで持つ。既存の決定行は現時点の付箋内容でバックフィルする
-- （削除済みの場合は空文字にフォールバック）。
ALTER TABLE decisions ADD COLUMN note_content TEXT NOT NULL DEFAULT '';

UPDATE decisions
SET note_content = COALESCE(
  (SELECT content FROM notes WHERE notes.id = decisions.note_id),
  ''
);
