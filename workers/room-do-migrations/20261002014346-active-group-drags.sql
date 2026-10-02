-- 一括ドラッグの開始座標と表示枠を、接続の付帯情報のサイズ上限に依存せず保存する。
-- 接続には操作IDだけを残し、終了・切断・工程変更でこの一時状態を削除する。
CREATE TABLE active_group_drags (
  drag_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL
);
