CREATE TABLE note_content_versions (
  note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  content_revision INTEGER NOT NULL DEFAULT 0 CHECK (content_revision >= 0)
);
CREATE TABLE note_content_receipts (
  operation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  content TEXT NOT NULL,
  expected_content_revision INTEGER NOT NULL,
  expected_phase_revision INTEGER NOT NULL,
  content_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX note_content_receipts_user_id ON note_content_receipts (user_id, operation_id);
CREATE TABLE pending_phase_transition (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  transition_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('next', 'restart-writing')),
  expected_phase TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  force INTEGER NOT NULL DEFAULT 0,
  deadline_at INTEGER NOT NULL
);
