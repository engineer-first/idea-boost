-- 完了と同一トランザクションで固定する本人向け再訪の正本。
-- deleted 後は復活防止の時刻・識別情報のみ残し、本文と閲覧者は消す。
CREATE TABLE completed_room (
 id INTEGER PRIMARY KEY CHECK(id = 1),
 room_id TEXT NOT NULL,
 completed_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 decisions_json TEXT,
 scenes_json TEXT,
 viewers_json TEXT,
 retry_at INTEGER,
 deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
);
