-- V11 — Google Drive integration schema
-- Run: npx wrangler d1 execute fb-pack-studio-db --remote --file=schema_v11_drive.sql
-- Idempotent: each ALTER wrapped in DO NOTHING via separate file approach if columns exist

-- Users: store Drive refresh token + root folder id
ALTER TABLE users ADD COLUMN drive_refresh_token TEXT;
ALTER TABLE users ADD COLUMN drive_root_folder_id TEXT;
ALTER TABLE users ADD COLUMN drive_connected_at INTEGER;

-- Packs: per-pack Drive folder id
ALTER TABLE packs ADD COLUMN drive_folder_id TEXT;

-- Drive media files registry (replaces R2 media_files conceptually but smaller payload)
CREATE TABLE IF NOT EXISTS drive_files (
  id TEXT PRIMARY KEY,                             -- UUID
  pack_id TEXT NOT NULL,
  uploader_user_id TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,                     -- Google Drive file ID
  drive_web_link TEXT,                             -- shareable link
  asset_type TEXT NOT NULL,
  post_n INTEGER,
  scene_n INTEGER,
  sequence_n INTEGER,
  from_scene_n INTEGER,
  to_scene_n INTEGER,
  source TEXT,
  time_range TEXT,
  prompt TEXT,
  filename TEXT,
  size_bytes INTEGER NOT NULL,
  mime TEXT NOT NULL,
  brand_name TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  FOREIGN KEY (pack_id) REFERENCES packs(id) ON DELETE CASCADE,
  FOREIGN KEY (uploader_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_drive_pack ON drive_files(pack_id, asset_type, post_n);
CREATE INDEX IF NOT EXISTS idx_drive_alive ON drive_files(pack_id, deleted_at) WHERE deleted_at IS NULL;
