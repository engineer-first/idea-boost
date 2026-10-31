-- 退出後も顔を確保し、同じルームへの再参加で最後の顔を復元する。
CREATE TABLE member_avatar_assignments (
  user_id TEXT PRIMARY KEY,
  avatar_id TEXT NOT NULL UNIQUE CHECK (avatar_id IN ('face-01', 'face-02', 'face-03', 'face-04', 'face-05', 'face-06', 'face-07', 'face-08', 'face-09', 'face-10', 'face-11', 'face-12', 'face-13', 'face-14', 'face-15', 'face-16', 'face-17', 'face-18', 'face-19', 'face-20'))
);
-- 既存ルームは通算の色割当履歴から、退出者も含めて一意に埋める。
INSERT INTO member_avatar_assignments(user_id, avatar_id)
SELECT user_id, CASE color
  WHEN 'yellow' THEN 'face-01'
  WHEN 'green' THEN 'face-02'
  WHEN 'blue' THEN 'face-03'
  WHEN 'pink' THEN 'face-04'
  WHEN 'orange' THEN 'face-05'
  WHEN 'purple' THEN 'face-06'
  WHEN 'red' THEN 'face-07'
  WHEN 'lime' THEN 'face-08'
  WHEN 'teal' THEN 'face-09'
  WHEN 'cyan' THEN 'face-10'
  WHEN 'indigo' THEN 'face-11'
  WHEN 'violet' THEN 'face-12'
  WHEN 'fuchsia' THEN 'face-13'
  WHEN 'rose' THEN 'face-14'
  WHEN 'amber' THEN 'face-15'
  WHEN 'emerald' THEN 'face-16'
  WHEN 'sky' THEN 'face-17'
  WHEN 'slate' THEN 'face-18'
  WHEN 'stone' THEN 'face-19'
  WHEN 'zinc' THEN 'face-20'
END
FROM member_color_assignments;
