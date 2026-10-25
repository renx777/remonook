CREATE TABLE IF NOT EXISTS workspaces (uid TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS assets (uid TEXT NOT NULL, hash TEXT NOT NULL, size INTEGER NOT NULL CHECK(size >= 0 AND size <= 2097152), PRIMARY KEY(uid, hash));

-- Additive migration. Never delete legacy workspaces or attachment records.
CREATE TABLE IF NOT EXISTS sync_documents (
 uid TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL,
 state_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_journal (
 uid TEXT NOT NULL, operation_id TEXT NOT NULL, request_hash TEXT NOT NULL,
 update_body TEXT NOT NULL, accepted_revision INTEGER NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(uid, operation_id)
);
CREATE INDEX IF NOT EXISTS sync_journal_revision ON sync_journal(uid, accepted_revision);

CREATE TABLE IF NOT EXISTS sync_imports (
 uid TEXT PRIMARY KEY, body TEXT NOT NULL, created_at INTEGER NOT NULL
);
