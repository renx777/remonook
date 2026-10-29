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
