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
