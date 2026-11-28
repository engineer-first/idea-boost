-- 次のステップへ進む前に全員へ出す予告。1ルームに同時に1つだけ持つ。
-- cause は予告が出たきっかけ（member: 誰かが押した / votes: 全員の投票がそろった /
-- timer: 時間切れ）。initiator_user_id は member のときだけ入る。
CREATE TABLE advance_notice (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  notice_id TEXT NOT NULL,
  phase_revision INTEGER NOT NULL,
  cause TEXT NOT NULL CHECK (cause IN ('member', 'votes', 'timer')),
  initiator_user_id TEXT,
  ends_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL
);

-- 投票がそろった予告を誰かが止めた工程。その工程では自動の予告を出し直さない。
CREATE TABLE advance_notice_votes_hold (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  phase_revision INTEGER NOT NULL
);
