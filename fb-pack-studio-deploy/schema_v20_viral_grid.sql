-- V20 — Viral Grid Master integration
-- Stores master.json sessions: 4 phase outputs gom thành 1 record

CREATE TABLE IF NOT EXISTS viral_grid_sessions (
  id TEXT PRIMARY KEY,                    -- UUID
  user_id TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  intake_json TEXT NOT NULL,              -- 8-câu intake form
  brand_dna_json TEXT,                    -- optional from brand-strategy-engine

  -- Phase outputs (lazy populated)
  phase1_keyword_tree_json TEXT,
  phase2_content_matrix_json TEXT,
  phase3_visual_dna_json TEXT,
  phase4_execution_plan_json TEXT,

  -- Master output + dashboard
  master_json TEXT,                       -- merged from 4 phases
  dashboard_url TEXT,                     -- public R2 URL of rendered HTML

  -- Metadata
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | failed
  phases_completed INTEGER DEFAULT 0,    -- 0-4
  total_leaves INTEGER,
  total_ideas INTEGER,
  viral_ratio INTEGER DEFAULT 60,
  calendar_days INTEGER DEFAULT 30,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER,
  error_msg TEXT,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vgs_user ON viral_grid_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vgs_status ON viral_grid_sessions(status);

-- Track which packs were created from which viral grid session
ALTER TABLE packs ADD COLUMN viral_grid_session_id TEXT;
ALTER TABLE packs ADD COLUMN content_matrix_used_idea_ids TEXT;  -- JSON array of consumed idea IDs
