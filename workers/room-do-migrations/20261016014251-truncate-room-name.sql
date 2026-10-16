-- truncate-room-name: 既存名を入力上限15（UTF-16単位）に揃える。
-- 元の名前の復元が必要な場合は、適用前のDBバックアップから戻す。
UPDATE shared_outcome_identity
SET room_name = (
  WITH RECURSIVE prefix(pos, units) AS (
    VALUES(0, 0)
    UNION ALL
    SELECT pos + 1, units + CASE WHEN unicode(substr(room_name, pos + 1, 1)) > 65535 THEN 2 ELSE 1 END
    FROM prefix
    WHERE pos < length(room_name)
      AND units + CASE WHEN unicode(substr(room_name, pos + 1, 1)) > 65535 THEN 2 ELSE 1 END <= 15
  )
  SELECT substr(room_name, 1, max(pos)) FROM prefix
)
WHERE room_name IS NOT NULL;
