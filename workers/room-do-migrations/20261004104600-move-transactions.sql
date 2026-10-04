CREATE TABLE note_move_versions (
  note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  position_revision INTEGER NOT NULL DEFAULT 0,
  visibility_revision INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE room_state ADD COLUMN group_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE room_state ADD COLUMN map_revision INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER note_position_revision AFTER UPDATE OF x, y ON notes
WHEN OLD.x <> NEW.x OR OLD.y <> NEW.y
BEGIN
  INSERT INTO note_move_versions(note_id,position_revision) VALUES (NEW.id,1)
  ON CONFLICT(note_id) DO UPDATE SET position_revision = position_revision + 1;
END;
CREATE TRIGGER note_visibility_revision AFTER UPDATE OF visibility ON notes
WHEN OLD.visibility <> NEW.visibility
BEGIN
  INSERT INTO note_move_versions(note_id,visibility_revision) VALUES (NEW.id,1)
  ON CONFLICT(note_id) DO UPDATE SET visibility_revision = visibility_revision + 1;
END;
CREATE TRIGGER group_insert_revision AFTER INSERT ON groups
BEGIN UPDATE room_state SET group_revision = group_revision + 1 WHERE id = 1; END;
CREATE TRIGGER group_delete_revision AFTER DELETE ON groups
BEGIN UPDATE room_state SET group_revision = group_revision + 1 WHERE id = 1; END;
CREATE TRIGGER group_update_revision AFTER UPDATE OF name, note_ids ON groups
WHEN OLD.name <> NEW.name OR OLD.note_ids <> NEW.note_ids
BEGIN UPDATE room_state SET group_revision = group_revision + 1 WHERE id = 1; END;
CREATE TRIGGER map_revision AFTER UPDATE OF idea_map_size_level, idea_map_size_initialized ON room_state
WHEN OLD.idea_map_size_level <> NEW.idea_map_size_level OR OLD.idea_map_size_initialized <> NEW.idea_map_size_initialized
BEGIN UPDATE room_state SET map_revision = OLD.map_revision + 1 WHERE id = 1; END;
CREATE TABLE note_move_operations (
  operation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  request_json TEXT NOT NULL,
  state TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  result_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX note_move_operations_lease ON note_move_operations(state, lease_until);
CREATE INDEX note_move_operations_user ON note_move_operations(user_id, created_at);
CREATE TABLE note_move_locks (
  note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL REFERENCES note_move_operations(operation_id) ON DELETE CASCADE
);
CREATE INDEX note_move_locks_operation ON note_move_locks(operation_id);
CREATE TRIGGER move_phase_boundary AFTER UPDATE OF phase_revision ON room_state
WHEN OLD.phase_revision <> NEW.phase_revision
BEGIN
  UPDATE note_move_operations SET state='cancelled',result_json=NULL WHERE state='active';
  DELETE FROM note_move_locks;
END;
CREATE TRIGGER move_adoption_boundary AFTER INSERT ON decisions
BEGIN
  UPDATE note_move_operations SET state='cancelled',result_json=NULL WHERE state='active';
  DELETE FROM note_move_locks;
END;
CREATE TRIGGER move_member_leaving AFTER DELETE ON members
BEGIN
  DELETE FROM note_move_locks WHERE operation_id IN (SELECT operation_id FROM note_move_operations WHERE user_id=OLD.user_id);
  UPDATE note_move_operations SET state='cancelled',result_json=NULL WHERE user_id=OLD.user_id AND state='active';
END;
-- 旧clientのattachment lockもalarmで解放し、peerのdragging表示を期限内に戻す。
CREATE TABLE legacy_note_drag_leases (
  user_id TEXT NOT NULL,
  drag_id TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  PRIMARY KEY (user_id, drag_id)
);
CREATE INDEX legacy_note_drag_leases_deadline ON legacy_note_drag_leases(lease_until);
