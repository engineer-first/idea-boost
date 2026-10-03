-- 作成者シードの補完と移譲後の再送を区別する永続改訂。
ALTER TABLE room_owner ADD COLUMN host_revision INTEGER NOT NULL DEFAULT 0;
