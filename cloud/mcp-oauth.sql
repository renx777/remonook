-- Additive migration for AI app sign-in (OAuth). Apply once, after cloud/mcp.sql, before deploying the sync Worker.
ALTER TABLE mcp_tokens ADD COLUMN expires_at INTEGER;
ALTER TABLE mcp_tokens ADD COLUMN grant_id TEXT;
-- Sign-in connections for AI apps (OAuth 2.1 with PKCE). Codes and refresh tokens are stored as hashes.
CREATE TABLE IF NOT EXISTS oauth_clients (
 client_id TEXT PRIMARY KEY, name TEXT NOT NULL, redirect_uris TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_requests (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, code_challenge TEXT NOT NULL,
 state TEXT NOT NULL, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_codes (
 hash TEXT PRIMARY KEY, uid TEXT NOT NULL, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL,
 code_challenge TEXT NOT NULL, grant_id TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER
);
CREATE TABLE IF NOT EXISTS mcp_grants (
 id TEXT PRIMARY KEY, uid TEXT NOT NULL, client_id TEXT NOT NULL, name TEXT NOT NULL, scopes TEXT NOT NULL,
 refresh_hash TEXT, refresh_expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS mcp_grants_uid ON mcp_grants(uid);
CREATE UNIQUE INDEX IF NOT EXISTS mcp_grants_refresh ON mcp_grants(refresh_hash) WHERE refresh_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS mcp_tokens_grant ON mcp_tokens(grant_id);
