-- 作成要求・ルーム・期限をmarkerへ保持する。旧markerのNULLは互換照合時に補完する。
ALTER TABLE room_creation_marker ADD COLUMN request_id TEXT;
ALTER TABLE room_creation_marker ADD COLUMN room_id TEXT;
ALTER TABLE room_creation_marker ADD COLUMN expires_at INTEGER;
