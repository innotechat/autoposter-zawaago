-- Cloudflare D1 Migration: Content Intelligence & Operating System
-- Migration Number: 0002
-- Description: Core tables for autonomous content intelligence, brand brain, content memory, creative direction, jobs, quality checks and performance feedback

CREATE TABLE IF NOT EXISTS content_brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  handle TEXT NOT NULL,
  mission TEXT NOT NULL,
  config_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content_plans (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  format TEXT NOT NULL, -- 'POST', 'REEL', 'STORY'
  pillar TEXT NOT NULL,
  sub_pillar TEXT NOT NULL,
  objective TEXT NOT NULL,
  topic TEXT NOT NULL,
  angle TEXT NOT NULL,
  hook TEXT NOT NULL,
  caption_brief TEXT,
  cta TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  language TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PLANNED', -- 'PLANNED', 'GENERATING', 'GENERATED', 'QUALITY_CHECK', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED'
  quality_score REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS creative_directions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  brand TEXT NOT NULL,
  format TEXT NOT NULL,
  visual_family TEXT NOT NULL,
  subject TEXT NOT NULL,
  composition TEXT NOT NULL,
  camera_perspective TEXT,
  lighting TEXT,
  color_palette TEXT,
  environment TEXT,
  character_styling TEXT,
  visual_metaphor TEXT,
  aspect_ratio TEXT NOT NULL,
  branding_treatment TEXT NOT NULL,
  no_text_policy INTEGER NOT NULL DEFAULT 1,
  prompt_output TEXT NOT NULL,
  scenes_json TEXT, -- For REEL formats (per-scene creative direction)
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (plan_id) REFERENCES content_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_memory (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  plan_id TEXT,
  format TEXT NOT NULL,
  pillar TEXT NOT NULL,
  topic TEXT NOT NULL,
  angle TEXT NOT NULL,
  hook TEXT NOT NULL,
  visual_family TEXT NOT NULL,
  visual_concept TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  published_at TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  performance_score REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content_jobs (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  brand TEXT NOT NULL,
  format TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PLANNED',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  current_step TEXT,
  asset_url TEXT,
  video_url TEXT,
  caption TEXT,
  error_message TEXT,
  execution_logs TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (plan_id) REFERENCES content_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_quality_checks (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  overall_score REAL NOT NULL,
  passed INTEGER NOT NULL,
  content_score REAL NOT NULL,
  visual_score REAL NOT NULL,
  repetition_score REAL NOT NULL,
  details_json TEXT NOT NULL,
  retry_directive TEXT,
  evaluated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (plan_id) REFERENCES content_plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_performance (
  id TEXT PRIMARY KEY,
  plan_id TEXT,
  brand TEXT NOT NULL,
  format TEXT NOT NULL,
  topic TEXT NOT NULL,
  angle TEXT NOT NULL,
  visual_family TEXT NOT NULL,
  facebook_id TEXT,
  reach INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  reactions INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  video_views INTEGER DEFAULT 0,
  retention_rate REAL DEFAULT 0,
  recorded_at TEXT DEFAULT (datetime('now'))
);

-- High-performance indexes for edge D1 queries
CREATE INDEX IF NOT EXISTS idx_plans_brand_date ON content_plans(brand, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_plans_status ON content_plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_format ON content_plans(format);
CREATE INDEX IF NOT EXISTS idx_memory_lookup ON content_memory(brand, topic, angle);
CREATE INDEX IF NOT EXISTS idx_memory_created ON content_memory(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_family ON content_memory(brand, visual_family);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON content_jobs(state);
CREATE INDEX IF NOT EXISTS idx_jobs_plan ON content_jobs(plan_id);
CREATE INDEX IF NOT EXISTS idx_performance_topic ON content_performance(brand, topic);
