-- V10 — Collaboration + Media Sync schema
-- Run: npx wrangler d1 execute fb-pack-studio-db --remote --file=schema_v10_collab.sql

-- ============================================================
-- V10.1 — Pack sharing
-- ============================================================

CREATE TABLE IF NOT EXISTS pack_shares (
  pack_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  collaborator_email TEXT NOT NULL,                -- email of invitee (lowercase)
  collaborator_user_id TEXT,                       -- NULL until they sign in & accept
  role TEXT NOT NULL CHECK(role IN ('admin','editor','viewer','commenter')),
  invited_at INTEGER NOT NULL,
  accepted_at INTEGER,                             -- NULL = pending
  invited_by_user_id TEXT NOT NULL,
  last_active_at INTEGER,
  PRIMARY KEY (pack_id, collaborator_email),
  FOREIGN KEY (pack_id) REFERENCES packs(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shares_email ON pack_shares(collaborator_email, accepted_at);
CREATE INDEX IF NOT EXISTS idx_shares_user ON pack_shares(collaborator_user_id);
CREATE INDEX IF NOT EXISTS idx_shares_pack ON pack_shares(pack_id);

-- Activity log: who did what to which pack (for collaboration awareness)
CREATE TABLE IF NOT EXISTS pack_activity (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT,
  user_name TEXT,
  action TEXT NOT NULL,                            -- 'edit', 'gen_image', 'gen_voice', 'gen_video', 'publish_fb', 'share', 'unshare', 'role_change'
  target TEXT,                                     -- e.g. 'post_15', 'scene_3', 'voice_2'
  meta_json TEXT,                                  -- arbitrary JSON details
  created_at INTEGER NOT NULL,
  FOREIGN KEY (pack_id) REFERENCES packs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_activity_pack ON pack_activity(pack_id, created_at DESC);

-- ============================================================
-- V10.2 — R2 media files metadata
-- ============================================================

CREATE TABLE IF NOT EXISTS media_files (
  id TEXT PRIMARY KEY,                             -- UUID
  pack_id TEXT NOT NULL,
  uploader_user_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,                        -- 'image' (post main), 'audio', 'video', 'storyboard', 'mascot', 'product'
  post_n INTEGER,                                  -- which post (NULL for mascot/product refs)
  scene_n INTEGER,                                 -- scene number for storyboard
  sequence_n INTEGER,                              -- chain video sequence
  from_scene_n INTEGER,                            -- chain video metadata
  to_scene_n INTEGER,
  source TEXT,                                     -- 'auto-chain-par', 'editor-regen', 'cinema-export', etc.
  time_range TEXT,                                 -- e.g. "5.2-8.4s" for storyboard
  prompt TEXT,                                     -- truncated AI prompt
  r2_key TEXT NOT NULL,                            -- R2 object key (path inside bucket)
  size_bytes INTEGER NOT NULL,
  mime TEXT NOT NULL,
  width INTEGER,                                   -- image/video width
  height INTEGER,
  duration_sec REAL,                               -- audio/video duration
  brand_name TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,                              -- soft delete
  FOREIGN KEY (pack_id) REFERENCES packs(id) ON DELETE CASCADE,
  FOREIGN KEY (uploader_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_pack ON media_files(pack_id, asset_type, post_n);
CREATE INDEX IF NOT EXISTS idx_media_uploader ON media_files(uploader_user_id);
CREATE INDEX IF NOT EXISTS idx_media_alive ON media_files(deleted_at) WHERE deleted_at IS NULL;

-- Cloud sync preference per user
ALTER TABLE users ADD COLUMN cloud_sync_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN storage_used_bytes INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN storage_quota_bytes INTEGER DEFAULT 10737418240;  -- 10GB free tier
