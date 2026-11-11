-- 保存期間を30日から180日へ延ばす。D1 の行は RoomDO が期限で削除するまで残るため、
-- 残っている投影と索引へ差分の150日を足し、RoomDO 側の移行後の期限と揃える。
UPDATE shared_outcomes SET expires_at = expires_at + 150 * 86400000;
UPDATE progress_history_snapshots SET expires_at = expires_at + 150 * 86400000;
UPDATE completed_room_viewers SET expires_at = expires_at + 150 * 86400000;
