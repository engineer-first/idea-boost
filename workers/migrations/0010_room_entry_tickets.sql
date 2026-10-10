-- 一回だけの認証再開・入室遷移。使用済みIDだけを記録し本文や操作情報は保存しない。
CREATE TABLE consumed_room_tickets (
  ticket_id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX consumed_room_tickets_expiry ON consumed_room_tickets(expires_at);
