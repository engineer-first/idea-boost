-- 進行状態の旧フラット形式を「phaseN-stepM」形式へ正規化する。
-- 旧4フェーズ制（書く/共有/投票/集計）は現在のフェーズ1の5ステップ制へ
-- 再編された（グループ化 = step 3 が新設）ため、対応はステップ番号どおり
-- には並ばない: phase1(書く)→1-1, phase2(共有)→1-2, phase3(投票)→1-4,
-- phase4(集計)→1-5。'writing' は phase1 のさらに旧名。
-- 未知の値はここでは触らず、読み取り側（decodePhase）が lobby へ倒す。
UPDATE room_state
SET phase = CASE phase
  WHEN 'writing' THEN 'phase1-step1'
  WHEN 'phase1' THEN 'phase1-step1'
  WHEN 'phase2' THEN 'phase1-step2'
  WHEN 'phase3' THEN 'phase1-step4'
  WHEN 'phase4' THEN 'phase1-step5'
  ELSE phase
END;
