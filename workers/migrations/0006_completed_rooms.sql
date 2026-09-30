-- 本文を持たない本人向け索引。権利・期限の正本は RoomDO。
-- ロールバックはこの表を削除でき、既存の rooms と成果記録に影響しない。
CREATE TABLE completed_room_viewers (
 user_id TEXT NOT NULL,
 room_id TEXT NOT NULL,
 completed_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,room_id)
);
CREATE INDEX completed_room_viewers_page ON completed_room_viewers(user_id,completed_at DESC,room_id DESC);
CREATE INDEX completed_room_viewers_expiry ON completed_room_viewers(expires_at);
CREATE INDEX completed_room_viewers_room ON completed_room_viewers(room_id);
