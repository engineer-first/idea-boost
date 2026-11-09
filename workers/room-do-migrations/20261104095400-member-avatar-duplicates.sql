-- 顔アイコンは同じルームの参加者どうしで重複を許可し、変更は20種類の
-- 固定順を巡回する。SQLite は UNIQUE 制約を削除できないため、同じCHECKを
-- 持つ制約なしのテーブルへ作り直して既存の割当を保つ。
CREATE TABLE member_avatar_assignments_next (
  user_id TEXT PRIMARY KEY,
  avatar_id TEXT NOT NULL CHECK (avatar_id IN ('face-01', 'face-02', 'face-03', 'face-04', 'face-05', 'face-06', 'face-07', 'face-08', 'face-09', 'face-10', 'face-11', 'face-12', 'face-13', 'face-14', 'face-15', 'face-16', 'face-17', 'face-18', 'face-19', 'face-20'))
);
INSERT INTO member_avatar_assignments_next(user_id, avatar_id)
SELECT user_id, avatar_id FROM member_avatar_assignments;
DROP TABLE member_avatar_assignments;
ALTER TABLE member_avatar_assignments_next RENAME TO member_avatar_assignments;
