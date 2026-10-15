-- 保存待ち予約は工程確定の条件にしない。旧alarmからの二重進行を防ぐ。
DELETE FROM pending_phase_transition;
