-- roomsの削除後も要求IDを保持し、遅延再送が新しいルームを作らないようにする。
-- room_idは意図的にFKにしない（削除後の墓標）。
CREATE TABLE room_creation_requests (
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  name TEXT NOT NULL,
  room_id TEXT NOT NULL UNIQUE,
  invite_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'ready')),
  PRIMARY KEY(user_id, request_id)
);
