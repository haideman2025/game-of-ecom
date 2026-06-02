-- V15.0 — Meta Marketing API direct integration
-- Adds: user_access_token (separate from page_access_token) + ads_log tracking

-- 1. user_access_token column for Marketing API operations
-- (Page Access Token alone is insufficient for /me/adaccounts, campaigns, etc.)
ALTER TABLE fb_credentials ADD COLUMN user_access_token TEXT;
ALTER TABLE fb_credentials ADD COLUMN user_token_expires_at INTEGER;
ALTER TABLE fb_credentials ADD COLUMN ads_scopes TEXT;   -- ads_management, ads_read, business_management granted

-- 2. ads_log table to track every Meta Ad we create
CREATE TABLE IF NOT EXISTS ads_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  pack_id TEXT,
  post_n INTEGER,
  meta_campaign_id TEXT,
  meta_adset_id TEXT,
  meta_ad_id TEXT,
  meta_creative_id TEXT,
  ad_account_id TEXT NOT NULL,         -- "act_XXX"
  name TEXT,
  goal TEXT,                            -- engagement, traffic, leads, etc
  objective TEXT,                       -- Meta objective enum: OUTCOME_ENGAGEMENT, etc
  budget INTEGER,                       -- amount in major units (e.g. 100000 VND)
  currency TEXT,                        -- VND, USD, etc
  budget_type TEXT,                     -- daily | lifetime
  status TEXT,                          -- PAUSED, ACTIVE, DELETED
  fb_post_id TEXT,                      -- if this is a Boost — the source post
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ads_log_user ON ads_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_log_pack ON ads_log(pack_id);
CREATE INDEX IF NOT EXISTS idx_ads_log_campaign ON ads_log(meta_campaign_id);
