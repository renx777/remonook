CREATE TABLE IF NOT EXISTS article_snapshots (
 uid TEXT NOT NULL, hash TEXT NOT NULL, size INTEGER NOT NULL CHECK(size>=0 AND size<=2097152),
 state TEXT NOT NULL CHECK(state IN ('pending','ready','deleting','deleted')),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 PRIMARY KEY(uid,hash)
);
CREATE INDEX IF NOT EXISTS article_snapshot_expiry ON article_snapshots(state,expires_at);
