-- V11.2 — Drive folder mirror app structure: Pillar / Day / Post
ALTER TABLE drive_files ADD COLUMN pillar_n INTEGER;
ALTER TABLE drive_files ADD COLUMN day_n INTEGER;
ALTER TABLE drive_files ADD COLUMN pillar_folder_id TEXT;
ALTER TABLE drive_files ADD COLUMN post_folder_id TEXT;
ALTER TABLE drive_files ADD COLUMN pack_info_uploaded INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_drive_pillar_day ON drive_files(pack_id, pillar_n, day_n);
