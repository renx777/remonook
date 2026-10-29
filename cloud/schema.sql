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
-- Credentials live outside workspace documents, sync journals and user backups.
CREATE TABLE IF NOT EXISTS google_tasks_connections (
 uid TEXT PRIMARY KEY, version TEXT NOT NULL, status TEXT NOT NULL,
 subject TEXT, email TEXT, credentials TEXT, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS google_tasks_oauth (
 state TEXT PRIMARY KEY, uid TEXT NOT NULL, base_version TEXT NOT NULL,
 origin TEXT NOT NULL, verifier TEXT NOT NULL, nonce TEXT NOT NULL,
 browser_hash TEXT, completion_hash TEXT, result TEXT, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS google_tasks_oauth_expiry ON google_tasks_oauth(expires_at);
CREATE INDEX IF NOT EXISTS google_tasks_oauth_uid ON google_tasks_oauth(uid);
-- Receipts prevent duplicate task creation. Ambiguous requests are not replayed.
CREATE TABLE IF NOT EXISTS google_tasks_operations (
 uid TEXT NOT NULL, connection TEXT NOT NULL, operation TEXT NOT NULL,
 request_hash TEXT NOT NULL, result TEXT, created_at INTEGER NOT NULL,
 PRIMARY KEY(uid,connection,operation)
);

CREATE INDEX IF NOT EXISTS google_tasks_operations_expiry ON google_tasks_operations(created_at);
-- Books are separate from legacy attachments; their binary files never enter note sync.
CREATE TABLE IF NOT EXISTS books (
 uid TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,format TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size>=0 AND size<=26214400),hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','uploading','ready','deleting','deleted')),
 created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
 PRIMARY KEY(uid,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS books_active_hash ON books(uid,hash) WHERE state!='deleted';
CREATE INDEX IF NOT EXISTS books_expiry ON books(state,expires_at);
