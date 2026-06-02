-- V18 — Full Control schema additions
-- Render jobs queue for server-side MP4 rendering

CREATE TABLE IF NOT EXISTS render_jobs (
  id TEXT PRIMARY KEY,                   -- UUID
  user_id TEXT NOT NULL,
  pack_id TEXT,
  post_n INTEGER,
  type TEXT,                              -- 'slide' | 'cinema' | 'custom'
  timeline_json TEXT,                     -- full timeline spec
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  progress INTEGER DEFAULT 0,             -- 0-100
  result_url TEXT,                        -- R2 public URL when done
  error_msg TEXT,
  duration_seconds REAL,                  -- final video duration
  size_bytes INTEGER,                     -- output file size
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  worker_id TEXT,                         -- which worker picked it up
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_render_jobs_user ON render_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON render_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_render_jobs_pack ON render_jobs(pack_id);
