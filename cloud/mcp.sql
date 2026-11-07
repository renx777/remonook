-- Additive migration for connected AI apps (MCP). Apply to staging D1 before deploying the sync Worker.
-- Connected AI apps (MCP). Only token hashes are stored; activity holds metadata, never note text.
CREATE TABLE IF NOT EXISTS mcp_tokens (
 id TEXT PRIMARY KEY, uid TEXT NOT NULL, name TEXT NOT NULL, secret_hash TEXT NOT NULL,
 scopes TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER,
 window_start INTEGER NOT NULL DEFAULT 0, window_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS mcp_tokens_uid ON mcp_tokens(uid);
CREATE TABLE IF NOT EXISTS mcp_activity (
 uid TEXT NOT NULL, id TEXT NOT NULL, token_id TEXT NOT NULL, tool TEXT NOT NULL,
 summary TEXT NOT NULL, ids TEXT NOT NULL DEFAULT '[]', revision INTEGER, created_at INTEGER NOT NULL,
 PRIMARY KEY(uid,id)
);
CREATE INDEX IF NOT EXISTS mcp_activity_recent ON mcp_activity(uid,created_at);
