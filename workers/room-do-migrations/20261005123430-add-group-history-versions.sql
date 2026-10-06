-- 削除済みgroupの版も残し、名前/所属のABAを履歴の復元時に検出する。
-- 将来Undo機能を廃止するときはtriggerとtableを新規migrationで除去できる。
CREATE TABLE group_history_versions (
  group_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO group_history_versions(group_id,revision) SELECT id,0 FROM groups;
CREATE TRIGGER group_history_insert AFTER INSERT ON groups
BEGIN
  INSERT INTO group_history_versions(group_id,revision) VALUES(NEW.id,1)
  ON CONFLICT(group_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER group_history_delete AFTER DELETE ON groups
BEGIN
  INSERT INTO group_history_versions(group_id,revision) VALUES(OLD.id,1)
  ON CONFLICT(group_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER group_history_update AFTER UPDATE OF name,note_ids ON groups
WHEN OLD.name<>NEW.name OR OLD.note_ids<>NEW.note_ids
BEGIN
  INSERT INTO group_history_versions(group_id,revision) VALUES(NEW.id,1)
  ON CONFLICT(group_id) DO UPDATE SET revision=revision+1;
END;
