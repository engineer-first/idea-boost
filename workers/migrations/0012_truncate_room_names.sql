-- truncate-room-name: 既存名を入力上限15（UTF-16単位）に揃える。
-- 元の名前の復元が必要な場合は、適用前のDBバックアップから戻す。
UPDATE room_creation_requests
SET name = (
  WITH RECURSIVE prefix(pos, units) AS (
    VALUES(0, 0)
    UNION ALL
    SELECT pos + 1, units + CASE WHEN unicode(substr(name, pos + 1, 1)) > 65535 THEN 2 ELSE 1 END
    FROM prefix
    WHERE pos < length(name)
      AND units + CASE WHEN unicode(substr(name, pos + 1, 1)) > 65535 THEN 2 ELSE 1 END <= 15
  )
  SELECT substr(name, 1, max(pos)) FROM prefix
)
WHERE name IS NOT NULL;
