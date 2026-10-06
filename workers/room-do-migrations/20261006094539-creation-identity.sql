-- TODO: このマイグレーションの意図と SQL を書く。
ALTER TABLE room_creation_marker ADD COLUMN request_id TEXT;
ALTER TABLE room_creation_marker ADD COLUMN room_id TEXT;
ALTER TABLE room_creation_marker ADD COLUMN expires_at INTEGER;
