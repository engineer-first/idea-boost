-- 接続中ユーザー集合の変化を進行確認の世代へ反映する。
ALTER TABLE room_state ADD COLUMN progress_connected_user_ids TEXT NOT NULL DEFAULT '[]';
