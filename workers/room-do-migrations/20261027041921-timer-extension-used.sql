-- 同じ工程・発表者での1分延長を1回に制限する。
ALTER TABLE timer_state ADD COLUMN extension_used INTEGER NOT NULL DEFAULT 0
  CHECK (extension_used IN (0, 1));
