-- V21 — Brand Genesis Studio: unified pipeline (Wizard + Viral Grid merged)

ALTER TABLE viral_grid_sessions ADD COLUMN product_type TEXT;       -- 'course' | 'niche' | 'fmcg' | 'saas' | 'service' | 'info'
ALTER TABLE viral_grid_sessions ADD COLUMN materialized_pack_id TEXT;
ALTER TABLE viral_grid_sessions ADD COLUMN skills_routing_json TEXT;

CREATE TABLE IF NOT EXISTS spawned_artifacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  pack_id TEXT,
  skill_name TEXT NOT NULL,
  artifact_type TEXT,          -- comic | landing | mascot | game | video | doc | other
  intake_prompt TEXT,           -- the prompt to invoke skill with
  output_url TEXT,              -- R2 URL if pre-rendered
  output_json TEXT,             -- structured output if any
  status TEXT DEFAULT 'pending', -- pending | invoked | done | failed
  created_at INTEGER NOT NULL,
  invoked_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES viral_grid_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spawned_session ON spawned_artifacts(session_id);
CREATE INDEX IF NOT EXISTS idx_spawned_user ON spawned_artifacts(user_id, created_at DESC);
