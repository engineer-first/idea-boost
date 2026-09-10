-- 票数集約（note_votes）を、付箋上の位置を持つ個別シールへ移行する。
-- note_votes は旧クライアント／過去スキーマとの互換用に残すが、以降の真実は
-- note_vote_stickers のみとする。既存の集約行は決まった右上帯に展開してから
-- note_votes を空にし、二重集計を防ぐ。
CREATE TABLE IF NOT EXISTS note_vote_stickers (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('subjective', 'objective')),
  x REAL NOT NULL CHECK (x >= 0 AND x <= 1),
  y REAL NOT NULL CHECK (y >= 0 AND y <= 1),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_note_vote_stickers_note_kind
  ON note_vote_stickers (note_id, kind);
CREATE INDEX IF NOT EXISTS idx_note_vote_stickers_user_kind
  ON note_vote_stickers (user_id, kind);

WITH RECURSIVE expanded_votes AS (
  SELECT note_id, user_id, kind, created_at, vote_count, 1 AS ordinal
  FROM note_votes
  UNION ALL
  SELECT note_id, user_id, kind, created_at, vote_count, ordinal + 1
  FROM expanded_votes
  WHERE ordinal < vote_count
)
INSERT INTO note_vote_stickers (id, note_id, user_id, kind, x, y, created_at)
SELECT
  lower(hex(randomblob(4))) || '-0000-4000-8000-' || lower(hex(randomblob(6))),
  note_id,
  user_id,
  kind,
  CASE kind
    WHEN 'subjective' THEN 0.82
    ELSE MIN(0.93, 0.72 + (ordinal - 1) * 0.08)
  END,
  0.16,
  created_at
FROM expanded_votes;

DELETE FROM note_votes;
