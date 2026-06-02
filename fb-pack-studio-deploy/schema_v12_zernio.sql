-- V12 — Zernio integration schema
-- Add API key + selected FB account to users; create scheduled_posts tracking table

-- 1. users: store Zernio API key + selected FB account
ALTER TABLE users ADD COLUMN zernio_api_key TEXT;
ALTER TABLE users ADD COLUMN zernio_account_id TEXT;
ALTER TABLE users ADD COLUMN zernio_account_name TEXT;
ALTER TABLE users ADD COLUMN zernio_connected_at INTEGER;

-- 2. scheduled_posts: track Zernio posts created from our app
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  post_n INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  zernio_post_id TEXT NOT NULL,
  zernio_account_id TEXT,
  status TEXT DEFAULT 'pending',          -- pending | scheduled | published | failed
  scheduled_for INTEGER,                   -- unix ms, null = publish now
  published_at INTEGER,                    -- when actually published
  content_snapshot TEXT,                   -- caption sent
  media_count INTEGER DEFAULT 0,
  media_type TEXT,                         -- image | video | mixed
  insights_json TEXT,                      -- last analytics snapshot
  insights_fetched_at INTEGER,
  error_msg TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sp_pack ON scheduled_posts (pack_id);
CREATE INDEX IF NOT EXISTS idx_sp_user ON scheduled_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_sp_status ON scheduled_posts (status);
CREATE INDEX IF NOT EXISTS idx_sp_zernio ON scheduled_posts (zernio_post_id);
