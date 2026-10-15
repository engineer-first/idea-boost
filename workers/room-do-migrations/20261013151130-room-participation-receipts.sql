CREATE TABLE room_participation_receipts (
 operation_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 result TEXT NOT NULL CHECK(result IN ('left','disbanded')),
 PRIMARY KEY(operation_id,user_id)
);
CREATE TABLE room_participation_reservations (
 user_id TEXT PRIMARY KEY,
 operation_id TEXT NOT NULL,
 generation INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE room_participation_fences (
 user_id TEXT PRIMARY KEY,
 generation INTEGER NOT NULL,
 operation_id TEXT NOT NULL,
 joined INTEGER NOT NULL DEFAULT 0 CHECK(joined IN (0,1))
);
