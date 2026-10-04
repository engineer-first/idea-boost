-- 途中退出者の成果再訪希望だけを保持する。作業メンバーの認可とは分離する。
CREATE TABLE retained_outcome_participants (
  user_id TEXT PRIMARY KEY
);
