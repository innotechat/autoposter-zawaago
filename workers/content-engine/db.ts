import type { D1DatabaseLike } from "./content-memory";
import { getBrandProfile } from "./brand-brain";

let tablesInitialized = false;

export async function ensureContentEngineTables(db?: D1DatabaseLike): Promise<boolean> {
  if (!db || tablesInitialized) return true;

  try {
    // Execute atomic DDL statements to avoid multi-statement parse errors in Cloudflare D1
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS content_brands (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          handle TEXT NOT NULL,
          mission TEXT NOT NULL,
          config_json TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )`
      )
      .run();

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS content_plans (
          id TEXT PRIMARY KEY,
          brand TEXT NOT NULL,
          format TEXT NOT NULL,
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
          status TEXT NOT NULL DEFAULT 'PLANNED',
          quality_score REAL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )`
      )
      .run();

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS creative_directions (
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
          scenes_json TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`
      )
      .run();

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS content_memory (
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
        )`
      )
      .run();

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS content_jobs (
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
          updated_at TEXT DEFAULT (datetime('now'))
        )`
      )
      .run();

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS content_quality_checks (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          overall_score REAL NOT NULL,
          passed INTEGER NOT NULL,
          content_score REAL NOT NULL,
          visual_score REAL NOT NULL,
          repetition_score REAL NOT NULL,
          details_json TEXT NOT NULL,
          retry_directive TEXT,
          evaluated_at TEXT DEFAULT (datetime('now'))
        )`
      )
      .run();

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS content_performance (
          id TEXT PRIMARY KEY,
          plan_id TEXT,
          brand TEXT NOT NULL,
          format TEXT NOT NULL,
          topic TEXT NOT NULL,
          angle TEXT NOT NULL,
          visual_family TEXT NOT NULL,
          reach INTEGER DEFAULT 0,
          recorded_at TEXT DEFAULT (datetime('now'))
        )`
      )
      .run();

    // Create Indexes
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_plans_brand_date ON content_plans(brand, scheduled_for)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_plans_status ON content_plans(status)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_memory_lookup ON content_memory(brand, topic, angle)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_jobs_state ON content_jobs(state)`).run();

    // Seed default brands
    for (const name of ["Zawaago", "InnoTech"]) {
      const p = getBrandProfile(name);
      await db
        .prepare(
          `INSERT OR IGNORE INTO content_brands (id, name, handle, mission, config_json) VALUES (?, ?, ?, ?, ?)`
        )
        .bind(p.id, p.name, p.handle, p.mission, JSON.stringify(p))
        .run();
    }

    tablesInitialized = true;
    return true;
  } catch (err) {
    console.error("ensureContentEngineTables error:", err);
    return false;
  }
}
