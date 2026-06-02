-- V13 — Video Studio schema
-- Persist timeline projects per pack/user. MP4 exports staged to R2 reuse /m/<key>.

CREATE TABLE IF NOT EXISTS video_projects (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT,
  description TEXT,
  -- Timeline JSON shape:
  -- {
  --   "fps": 30,
  --   "width": 1080,
  --   "height": 1920,
  --   "tracks": [
  --     {"id":"v1","kind":"video","clips":[{"id":"c1","assetId":"...","srcKind":"video|image|audio","startMs":0,"endMs":3000,"trimInMs":0,"trimOutMs":3000,"name":"..."}]},
  --     {"id":"a1","kind":"audio","clips":[...]}
  --   ]
  -- }
  timeline_json TEXT NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  width INTEGER DEFAULT 1080,
  height INTEGER DEFAULT 1920,
  fps INTEGER DEFAULT 30,
  -- Exported MP4 staged to R2
  exported_r2_key TEXT,
  exported_url TEXT,
  exported_size_bytes INTEGER,
  exported_at INTEGER,
  -- Publish hand-off
  last_zernio_post_id TEXT,
  last_published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vp_pack ON video_projects (pack_id);
CREATE INDEX IF NOT EXISTS idx_vp_user ON video_projects (user_id);
CREATE INDEX IF NOT EXISTS idx_vp_updated ON video_projects (updated_at DESC);
