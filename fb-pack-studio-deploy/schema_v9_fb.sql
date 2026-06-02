-- V9 — Facebook integration schema additions
-- Run this on D1: npx wrangler d1 execute fb-pack-studio-db --remote --file=schema_v9_fb.sql

CREATE TABLE IF NOT EXISTS fb_credentials (
  user_id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  page_name TEXT,
  page_access_token TEXT NOT NULL,   -- long-lived Page Token (60 days)
  token_expires_at INTEGER,           -- ms timestamp, NULL = never (or refresh)
  scopes TEXT,                        -- comma-separated granted scopes
  ad_account_id TEXT,                 -- optional, for Phase B Boost
  connected_at INTEGER NOT NULL,
  last_used_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fb_creds_page ON fb_credentials(page_id);

-- Track every publish for audit + rate limiting + retry
CREATE TABLE IF NOT EXISTS fb_publish_log (
  id TEXT PRIMARY KEY,                -- generated UUID
  user_id TEXT NOT NULL,
  pack_id TEXT,                       -- optional FK to pack
  post_n INTEGER,                     -- post number in pack
  page_id TEXT NOT NULL,
  fb_post_id TEXT,                    -- the actual FB post id returned by Graph API
  status TEXT NOT NULL,               -- 'pending', 'published', 'failed', 'scheduled'
  scheduled_for INTEGER,              -- ms timestamp if scheduled
  caption TEXT,
  has_image INTEGER DEFAULT 0,
  has_video INTEGER DEFAULT 0,
  has_first_comment INTEGER DEFAULT 0,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  published_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fb_log_user ON fb_publish_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_log_status ON fb_publish_log(status, scheduled_for);
