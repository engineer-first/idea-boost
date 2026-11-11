-- 保存期間を30日から180日へ延ばす。期限は記録ごとに保存済みのため、未削除の記録へ差分の150日を足す。
-- アラームは期限ちょうどに起動し、この移行はアラーム処理より先に走る。期限前かどうかでなく、
-- 本文が残っているか（未削除か）で判定し、起動時点で期限を迎えた記録も延ばす。
UPDATE shared_outcome_state
 SET expires_at = expires_at + 150 * 86400000
 WHERE pending_json IS NOT NULL OR saved_json IS NOT NULL OR expires_at > unixepoch() * 1000;
UPDATE completed_room
 SET expires_at = expires_at + 150 * 86400000
 WHERE deleted = 0;
