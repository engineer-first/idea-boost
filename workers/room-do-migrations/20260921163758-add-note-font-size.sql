-- 付箋ごとの表示設定を notes のライフサイクルへ従属させる。
-- 行がない既存付箋はアプリケーションで従来相当の14pxとして補完し、
-- 公開コントラクトと同じ12〜24pxの整数だけを永続化する。
CREATE TABLE note_appearances (
  note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  font_size INTEGER NOT NULL DEFAULT 14
    CHECK (font_size BETWEEN 12 AND 24)
);
