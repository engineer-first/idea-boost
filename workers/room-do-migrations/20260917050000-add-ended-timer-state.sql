-- 手動終了・時間切れを再接続後も共有するため、終了状態を追加する。
CREATE TABLE timer_state_v2 (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'paused', 'ended')),
  ends_at INTEGER,
  remaining_ms INTEGER,
  duration_ms INTEGER,
  CHECK (
    (status = 'idle' AND ends_at IS NULL AND remaining_ms IS NULL AND duration_ms IS NULL)
    OR (status = 'running' AND ends_at IS NOT NULL AND remaining_ms IS NULL AND duration_ms IS NOT NULL)
    OR (status = 'paused' AND ends_at IS NULL AND remaining_ms IS NOT NULL AND duration_ms IS NOT NULL)
    OR (status = 'ended' AND ends_at IS NULL AND remaining_ms IS NULL AND duration_ms IS NOT NULL)
  )
);
INSERT INTO timer_state_v2 (id, status, ends_at, remaining_ms, duration_ms)
  SELECT id, status, ends_at, remaining_ms, duration_ms FROM timer_state;
DROP TABLE timer_state;
ALTER TABLE timer_state_v2 RENAME TO timer_state;
