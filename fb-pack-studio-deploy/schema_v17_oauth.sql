-- V17 — OAuth 2.1 for MCP (Cowork + claude.ai web connector compatibility)
-- Implements: Dynamic Client Registration (RFC 7591), Authorization Code + PKCE (RFC 7636)

-- OAuth clients (each Claude client registers itself via DCR)
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,            -- generated random
  client_secret_hash TEXT,                -- nullable for public clients
  client_name TEXT,                       -- "Claude Cowork", "Claude.ai", etc.
  redirect_uris TEXT NOT NULL,            -- JSON array
  grant_types TEXT,                       -- JSON array, e.g. ["authorization_code","refresh_token"]
  response_types TEXT,                    -- JSON array
  scope TEXT,                              -- space-separated
  token_endpoint_auth_method TEXT,        -- "none" | "client_secret_post" | "client_secret_basic"
  software_id TEXT,
  software_version TEXT,
  created_at INTEGER NOT NULL
);

-- Short-lived authorization codes (10 minutes max per spec)
CREATE TABLE IF NOT EXISTS oauth_codes (
  code TEXT PRIMARY KEY,                  -- random 64 hex
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,                  -- which user granted consent
  redirect_uri TEXT NOT NULL,
  scopes TEXT,                            -- granted scopes (space-separated)
  code_challenge TEXT,                    -- PKCE challenge
  code_challenge_method TEXT,             -- "S256"
  expires_at INTEGER NOT NULL,
  used_at INTEGER,                        -- mark consumed (one-time use)
  FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON oauth_codes(expires_at);

-- Add OAuth metadata columns to mcp_api_keys (reuse for access tokens)
ALTER TABLE mcp_api_keys ADD COLUMN issued_via TEXT DEFAULT 'manual';   -- 'manual' | 'oauth'
ALTER TABLE mcp_api_keys ADD COLUMN oauth_client_id TEXT;
ALTER TABLE mcp_api_keys ADD COLUMN refresh_token_hash TEXT;
ALTER TABLE mcp_api_keys ADD COLUMN refresh_expires_at INTEGER;
