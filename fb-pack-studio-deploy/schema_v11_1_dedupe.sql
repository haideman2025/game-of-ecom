-- V11.1 — Add content_hash for dedupe + day folder cache
ALTER TABLE drive_files ADD COLUMN content_hash TEXT;
ALTER TABLE drive_files ADD COLUMN day_folder TEXT;
ALTER TABLE drive_files ADD COLUMN type_folder_id TEXT;

-- Index for fast dedupe lookup
CREATE INDEX IF NOT EXISTS idx_drive_hash ON drive_files(pack_id, content_hash) WHERE deleted_at IS NULL;
