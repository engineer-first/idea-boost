-- 順番はルーム全体で保持し、進捗だけを共有ステップごとに初期化する。
CREATE TABLE sharing_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state_json TEXT NOT NULL
);
