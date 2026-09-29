-- 成果保全と再試行の正本。ルーム解散でもこの行は期限まで残す。
CREATE TABLE shared_outcome_state (
 id INTEGER PRIMARY KEY CHECK(id = 1),
 room_id TEXT NOT NULL,
 room_name TEXT,
 display_id TEXT NOT NULL,
 last_used_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 phase_json TEXT NOT NULL,
 confirmed INTEGER NOT NULL DEFAULT 0 CHECK(confirmed IN (0,1)),
 pending_json TEXT,
 saved_json TEXT,
 last_saved_at INTEGER,
 save_status TEXT NOT NULL DEFAULT 'pending' CHECK(save_status IN ('saved','pending','failed')),
 retry_at INTEGER,
 disbanded INTEGER NOT NULL DEFAULT 0 CHECK(disbanded IN (0,1))
);
