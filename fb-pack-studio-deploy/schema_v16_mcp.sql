-- V16 — MCP (Model Context Protocol) server schema
-- Lets users connect Claude Desktop/Code to Game of Ecom via API keys

CREATE TABLE IF NOT EXISTS mcp_api_keys (
  key_hash TEXT PRIMARY KEY,            -- sha256 hash of full key (sk_goe_<64hex>)
  user_id TEXT NOT NULL,
  label TEXT,                            -- "Claude Desktop · MacBook", "Claude Code Office"
  scopes TEXT,                           -- comma-separated: packs:read,packs:write,gen:write,ads:write,publish:write
  prefix TEXT,                           -- first 12 chars of key for display (sk_goe_aB12...)
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER,                    -- NULL = never expire
  revoked_at INTEGER,                    -- NULL = active
  call_count INTEGER DEFAULT 0,         -- usage counter for analytics
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mcp_keys_user ON mcp_api_keys(user_id);

-- Log every MCP call for audit + debugging
CREATE TABLE IF NOT EXISTS mcp_call_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  key_hash TEXT,
  tool_name TEXT,
  args_preview TEXT,                     -- truncated JSON of args
  status TEXT,                            -- ok | error
  error_msg TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mcp_log_user ON mcp_call_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_log_key ON mcp_call_log(key_hash);
