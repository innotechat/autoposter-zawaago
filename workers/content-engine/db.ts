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

    // Safe incremental column additions for 10-day autonomous execution
    const optionalColumns = [
      "ALTER TABLE content_plans ADD COLUMN plan_json TEXT",
      "ALTER TABLE content_plans ADD COLUMN generated_caption TEXT",
      "ALTER TABLE content_plans ADD COLUMN generated_media_url TEXT",
      "ALTER TABLE content_plans ADD COLUMN facebook_post_id TEXT",
      "ALTER TABLE content_plans ADD COLUMN day_index INTEGER",
      "ALTER TABLE content_plans ADD COLUMN plan_batch_id TEXT",
      "ALTER TABLE content_plans ADD COLUMN published_at TEXT",
      "ALTER TABLE content_jobs ADD COLUMN facebook_post_id TEXT",
      "ALTER TABLE content_jobs ADD COLUMN published_at TEXT",
    ];
    for (const ddl of optionalColumns) {
      try {
        await db.prepare(ddl).run();
      } catch {
        // Ignored if column already exists
      }
    }

    tablesInitialized = true;
    return true;
  } catch (err) {
    console.error("ensureContentEngineTables error:", err);
    return false;
  }
}

export async function savePlanToD1(plan: any, db?: D1DatabaseLike): Promise<void> {
  if (!db) return;
  try {
    const postPlan = plan.format === "POST" ? plan : undefined;
    const reelPlan = plan.format === "REEL" ? plan : undefined;
    const generatedCaption = postPlan?.generatedCaption || "";
    const generatedMedia = postPlan?.generatedImageUrl || reelPlan?.generatedVideoUrl || "";
    const fbPostId = postPlan?.facebookPostId || reelPlan?.facebookPostId || reelPlan?.facebookVideoId || "";
    const publishedAt = plan.publishedAt || null;

    await db
      .prepare(
        `INSERT INTO content_plans (
          id, brand, format, pillar, sub_pillar, objective, topic, angle, hook,
          caption_brief, cta, target_audience, language, scheduled_for, status,
          quality_score, plan_json, generated_caption, generated_media_url,
          facebook_post_id, day_index, plan_batch_id, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          quality_score = excluded.quality_score,
          plan_json = excluded.plan_json,
          generated_caption = excluded.generated_caption,
          generated_media_url = excluded.generated_media_url,
          facebook_post_id = excluded.facebook_post_id,
          published_at = excluded.published_at,
          updated_at = datetime('now')`
      )
      .bind(
        plan.id,
        plan.brand,
        plan.format,
        plan.pillar,
        plan.subPillar || "general",
        plan.objective || "education",
        plan.topic,
        plan.angle,
        plan.hook,
        plan.captionBrief || null,
        plan.cta,
        plan.targetAudience || "Business Owners",
        plan.language || "English",
        plan.scheduledFor,
        plan.status,
        plan.qualityScore || null,
        JSON.stringify(plan),
        generatedCaption || null,
        generatedMedia || null,
        fbPostId || null,
        plan.dayIndex || null,
        plan.planBatchId || null,
        publishedAt
      )
      .run();

    if (postPlan?.creativeDirection) {
      const cd = postPlan.creativeDirection;
      await db
        .prepare(
          `INSERT OR REPLACE INTO creative_directions (
            id, plan_id, brand, format, visual_family, subject, composition,
            camera_perspective, lighting, color_palette, environment,
            character_styling, visual_metaphor, aspect_ratio, branding_treatment,
            no_text_policy, prompt_output
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          `cd-${plan.id}`,
          plan.id,
          plan.brand,
          plan.format,
          cd.visualFamily,
          cd.subject,
          cd.composition,
          cd.cameraPerspective || "",
          cd.lighting || "",
          cd.colorPalette || "",
          cd.environment || "",
          cd.characterStyling || "",
          cd.visualMetaphor || "",
          cd.aspectRatio || "1:1",
          cd.brandingTreatment || "Subtle watermark",
          cd.noTextPolicy ? 1 : 0,
          cd.promptOutput || ""
        )
        .run();
    }
  } catch (err) {
    console.warn("savePlanToD1 warning:", err);
  }
}

export async function loadPlansFromD1(db?: D1DatabaseLike, brand?: string, status?: string): Promise<any[]> {
  if (!db) return [];
  try {
    let query = "SELECT plan_json, status, quality_score, generated_caption, generated_media_url, facebook_post_id, published_at FROM content_plans WHERE 1=1";
    const binds: any[] = [];
    if (brand && brand !== "All") {
      query += " AND LOWER(brand) = LOWER(?)";
      binds.push(brand);
    }
    if (status && status !== "All") {
      query += " AND status = ?";
      binds.push(status);
    }
    query += " ORDER BY scheduled_for ASC";

    const res = await db.prepare(query).bind(...binds).all();
    const plans: any[] = [];
    for (const row of res.results || []) {
      if (row.plan_json) {
        try {
          const parsed = JSON.parse(row.plan_json as string);
          if (row.status) parsed.status = row.status;
          if (row.quality_score) parsed.qualityScore = row.quality_score;
          if (row.generated_caption) parsed.generatedCaption = row.generated_caption;
          if (row.generated_media_url) {
            if (parsed.format === "POST") parsed.generatedImageUrl = row.generated_media_url;
            else if (parsed.format === "REEL") parsed.generatedVideoUrl = row.generated_media_url;
          }
          if (row.facebook_post_id) {
            parsed.facebookPostId = row.facebook_post_id;
            if (parsed.format === "REEL") parsed.facebookVideoId = row.facebook_post_id;
          }
          if (row.published_at) parsed.publishedAt = row.published_at;
          plans.push(parsed);
        } catch (_) {}
      }
    }
    return plans;
  } catch (err) {
    console.warn("loadPlansFromD1 warning:", err);
    return [];
  }
}

export async function getPlanFromD1(id: string, db?: D1DatabaseLike): Promise<any | null> {
  if (!db) return null;
  try {
    const row = await db.prepare("SELECT plan_json, status, generated_caption, generated_media_url, facebook_post_id, published_at FROM content_plans WHERE id = ?").bind(id).first<any>();
    if (!row || !row.plan_json) return null;
    const parsed = JSON.parse(row.plan_json as string);
    if (row.status) parsed.status = row.status;
    if (row.generated_caption) parsed.generatedCaption = row.generated_caption;
    if (row.generated_media_url) {
      if (parsed.format === "POST") parsed.generatedImageUrl = row.generated_media_url;
      else if (parsed.format === "REEL") parsed.generatedVideoUrl = row.generated_media_url;
    }
    if (row.facebook_post_id) {
      parsed.facebookPostId = row.facebook_post_id;
      if (parsed.format === "REEL") parsed.facebookVideoId = row.facebook_post_id;
    }
    if (row.published_at) parsed.publishedAt = row.published_at;
    return parsed;
  } catch (err) {
    console.warn("getPlanFromD1 warning:", err);
    return null;
  }
}

export async function updatePlanInD1(id: string, updates: Record<string, any>, db?: D1DatabaseLike): Promise<void> {
  if (!db) return;
  try {
    const existing = await getPlanFromD1(id, db);
    const merged = { ...(existing || {}), ...updates, id, updatedAt: new Date().toISOString() };
    await savePlanToD1(merged, db);
  } catch (err) {
    console.warn("updatePlanInD1 warning:", err);
  }
}

export async function loadJobsFromD1(db?: D1DatabaseLike, brand?: string): Promise<any[]> {
  if (!db) return [];
  try {
    let query = "SELECT * FROM content_jobs WHERE 1=1";
    const binds: any[] = [];
    if (brand && brand !== "All") {
      query += " AND LOWER(brand) = LOWER(?)";
      binds.push(brand);
    }
    query += " ORDER BY updated_at DESC";
    const res = await db.prepare(query).bind(...binds).all();
    const jobs: any[] = [];
    for (const row of res.results || []) {
      let logs = [];
      try { logs = JSON.parse((row.execution_logs as string) || "[]"); } catch {}
      jobs.push({
        id: row.id as string,
        planId: row.plan_id as string,
        brand: row.brand as string,
        format: row.format as any,
        state: row.state as any,
        retryCount: Number(row.retry_count || 0),
        maxRetries: Number(row.max_retries || 3),
        currentStep: (row.current_step as string) || "",
        assetUrl: (row.asset_url as string) || undefined,
        videoUrl: (row.video_url as string) || undefined,
        caption: (row.caption as string) || undefined,
        facebookPostId: (row.facebook_post_id as string) || undefined,
        publishedAt: (row.published_at as string) || undefined,
        errorMessage: (row.error_message as string) || undefined,
        logs,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string
      });
    }
    return jobs;
  } catch (err) {
    console.warn("loadJobsFromD1 warning:", err);
    return [];
  }
}
