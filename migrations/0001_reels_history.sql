-- Cloudflare D1 Migration: Reels History and Metadata Lifecycle
-- Migration Number: 0001
-- Description: Create reels_history table with indexing for high-speed edge retrieval and analytics

CREATE TABLE IF NOT EXISTS reels_history (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 35,
  video_url TEXT NOT NULL,
  r2_key TEXT,
  thumbnail_url TEXT,
  caption TEXT,
  scenes_json TEXT,
  status TEXT DEFAULT 'ready',
  facebook_video_id TEXT,
  scheduled_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reels_brand ON reels_history(brand);
CREATE INDEX IF NOT EXISTS idx_reels_status ON reels_history(status);
CREATE INDEX IF NOT EXISTS idx_reels_created ON reels_history(created_at DESC);
