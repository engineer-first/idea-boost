-- 公開証拠は要求詳細と独立。新規INSERTの既定は非公開。
ALTER TABLE rooms ADD COLUMN creation_visibility TEXT NOT NULL DEFAULT 'hidden' CHECK(creation_visibility IN ('hidden','published','legacy'));
ALTER TABLE shared_outcomes ADD COLUMN creation_visibility TEXT NOT NULL DEFAULT 'hidden' CHECK(creation_visibility IN ('hidden','published','legacy'));
UPDATE rooms SET creation_visibility=CASE WHEN EXISTS(SELECT 1 FROM room_creation_requests c WHERE c.room_id=rooms.id AND c.status='pending') THEN 'hidden' ELSE 'legacy' END;
UPDATE shared_outcomes SET creation_visibility=CASE WHEN EXISTS(SELECT 1 FROM room_creation_requests c WHERE c.room_id=shared_outcomes.room_id AND c.status='pending') THEN 'hidden' ELSE 'legacy' END;
CREATE TABLE room_creation_policy (
 id INTEGER PRIMARY KEY CHECK(id=1),
 retired_before INTEGER NOT NULL DEFAULT 0,
 legacy_expires_at INTEGER NOT NULL,
 cleanup_enabled INTEGER NOT NULL DEFAULT 0 CHECK(cleanup_enabled IN (0,1))
);
INSERT INTO room_creation_policy(id,legacy_expires_at) VALUES(1,(unixepoch()+86400)*1000);
-- 詳細削除後もunknownを追跡。roomsのFKは設けない。
CREATE TABLE room_creation_control (
 user_id TEXT NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL,
 room_id TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL,
 legacy INTEGER NOT NULL DEFAULT 0 CHECK(legacy IN (0,1)),
 status TEXT NOT NULL CHECK(status IN ('pending','ready','closed')),
 retry_at INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,request_id)
);
CREATE INDEX room_creation_control_due ON room_creation_control(status,retry_at,expires_at);
INSERT INTO room_creation_control(user_id,request_id,room_id,expires_at,status,legacy)
 SELECT user_id,request_id,room_id,(SELECT legacy_expires_at FROM room_creation_policy WHERE id=1),status,1 FROM room_creation_requests;
CREATE INDEX room_creation_control_case ON room_creation_control(user_id,lower(request_id));

CREATE INDEX room_creation_control_expiry ON room_creation_control(expires_at);
-- D1 migrate→API deployの混在中も旧Workerが追跡外の新規要求を作れない。
CREATE TRIGGER room_creation_protocol_guard BEFORE INSERT ON room_creation_requests
WHEN NOT EXISTS(SELECT 1 FROM room_creation_control c WHERE c.user_id=NEW.user_id AND c.request_id=NEW.request_id AND c.room_id=NEW.room_id)
BEGIN SELECT RAISE(ABORT,'creation protocol upgrade required'); END;
