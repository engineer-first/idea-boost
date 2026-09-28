-- 同じステップへ戻った後も古い進行要求を拒否する単調増加番号。
ALTER TABLE room_state ADD COLUMN phase_revision INTEGER NOT NULL DEFAULT 0 CHECK (phase_revision >= 0);
