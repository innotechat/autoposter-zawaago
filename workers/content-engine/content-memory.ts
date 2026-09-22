import type {
  ContentFormat,
  ContentMemoryRecord,
  PostPlan,
  ReelPlan,
  StoryPlan,
  UnifiedContentPlan,
  VisualFamily
} from "./types";
import { computeSemanticFingerprint, extractTopicStem } from "./topic-engine";

// In-memory persistent cache for instant edge access and offline fallback
const IN_MEMORY_STORE: ContentMemoryRecord[] = [];

export interface D1DatabaseLike {
  prepare: (query: string) => {
    run: () => Promise<any>;
    all: <T = any>() => Promise<{ results?: T[] }>;
    first: <T = any>() => Promise<T | null>;
    bind: (...args: any[]) => {
      run: () => Promise<any>;
      all: <T = any>() => Promise<{ results?: T[] }>;
      first: <T = any>() => Promise<T | null>;
    };
  };
}

export interface R2BucketLike {
  get: (key: string) => Promise<any>;
  put: (key: string, value: any, options?: any) => Promise<any>;
  list: (options?: any) => Promise<any>;
}

const R2_MEMORY_KEY = "content-engine/memory/archive.json";

/**
 * Record a planned or generated piece of content into the memory store
 */
export async function recordContentMemory(
  record: Omit<ContentMemoryRecord, "id" | "createdAt">,
  db?: D1DatabaseLike,
  assets?: R2BucketLike
): Promise<ContentMemoryRecord> {
  const item: ContentMemoryRecord = {
    ...record,
    id: `mem-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString()
  };

  // 1. In-memory cache
  IN_MEMORY_STORE.unshift(item);

  // 2. D1 persistence (if available)
  if (db) {
    try {
      await db
        .prepare(
          `INSERT INTO content_memory (id, brand, plan_id, format, pillar, topic, angle, hook, visual_family, visual_concept, fingerprint, published_at, status, performance_score, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          item.id,
          item.brand,
          item.planId || null,
          item.format,
          item.pillar,
          item.topic,
          item.angle,
          item.hook,
          item.visualFamily,
          item.visualConcept,
          item.fingerprint,
          item.publishedAt || null,
          item.status,
          item.performanceScore || null,
          item.createdAt
        )
        .run();
    } catch (err) {
      console.warn("D1 content_memory insert failed, falling back to memory/R2:", err);
    }
  }

  // 3. R2 background backup (if available)
  if (assets) {
    try {
      await assets.put(
        `content-engine/memory/${item.brand.toLowerCase()}/${item.id}.json`,
        JSON.stringify(item),
        { httpMetadata: { contentType: "application/json" } }
      );
    } catch (err) {
      console.warn("R2 memory backup failed:", err);
    }
  }

  return item;
}

/**
 * Query recent content history for a brand within a specified lookback window
 */
export async function queryRecentHistory(
  brand: string,
  daysWindow = 30,
  db?: D1DatabaseLike,
  assets?: R2BucketLike
): Promise<ContentMemoryRecord[]> {
  const cutoff = new Date(Date.now() - daysWindow * 24 * 60 * 60 * 1000).toISOString();

  // Try D1 first
  if (db) {
    try {
      const res = await db
        .prepare(
          `SELECT * FROM content_memory WHERE LOWER(brand) = LOWER(?) AND created_at >= ? ORDER BY created_at DESC LIMIT 100`
        )
        .bind(brand, cutoff)
        .all<any>();

      if (res && res.results && res.results.length > 0) {
        return res.results.map((r: any) => ({
          id: r.id,
          brand: r.brand,
          planId: r.plan_id,
          format: r.format as ContentFormat,
          pillar: r.pillar,
          topic: r.topic,
          angle: r.angle,
          hook: r.hook,
          visualFamily: r.visual_family as VisualFamily,
          visualConcept: r.visual_concept,
          fingerprint: r.fingerprint,
          publishedAt: r.published_at,
          status: r.status,
          performanceScore: r.performance_score,
          createdAt: r.created_at
        }));
      }
    } catch (err) {
      console.warn("D1 queryRecentHistory error, falling back to memory:", err);
    }
  }

  // Fallback to in-memory store
  return IN_MEMORY_STORE.filter(
    (item) => item.brand.toLowerCase() === brand.toLowerCase() && item.createdAt >= cutoff
  );
}

/**
 * Get recent visual families used by the brand
 */
export async function getRecentVisualFamilies(
  brand: string,
  limit = 10,
  db?: D1DatabaseLike
): Promise<{ visualFamily: VisualFamily; createdAt: string }[]> {
  if (db) {
    try {
      const res = await db
        .prepare(
          `SELECT visual_family, created_at FROM content_memory WHERE LOWER(brand) = LOWER(?) ORDER BY created_at DESC LIMIT ?`
        )
        .bind(brand, limit)
        .all<{ visual_family: string; created_at: string }>();

      if (res && res.results && res.results.length > 0) {
        return res.results.map((r) => ({
          visualFamily: r.visual_family as VisualFamily,
          createdAt: r.created_at
        }));
      }
    } catch (err) {
      console.warn("D1 getRecentVisualFamilies error:", err);
    }
  }

  return IN_MEMORY_STORE.filter((item) => item.brand.toLowerCase() === brand.toLowerCase())
    .slice(0, limit)
    .map((item) => ({ visualFamily: item.visualFamily, createdAt: item.createdAt }));
}

/**
 * Search all memory records for a brand
 */
export async function searchMemory(
  brand?: string,
  query?: string,
  db?: D1DatabaseLike
): Promise<ContentMemoryRecord[]> {
  const cleanQ = (query || "").trim().toLowerCase();

  if (db) {
    try {
      let sql = `SELECT * FROM content_memory`;
      const params: any[] = [];
      const conditions: string[] = [];

      if (brand && brand !== "All") {
        conditions.push(`LOWER(brand) = LOWER(?)`);
        params.push(brand);
      }

      if (cleanQ) {
        conditions.push(`(LOWER(topic) LIKE ? OR LOWER(angle) LIKE ? OR LOWER(hook) LIKE ? OR LOWER(visual_family) LIKE ?)`);
        const like = `%${cleanQ}%`;
        params.push(like, like, like, like);
      }

      if (conditions.length > 0) {
        sql += ` WHERE ` + conditions.join(" AND ");
      }
      sql += ` ORDER BY created_at DESC LIMIT 60`;

      const res = await db.prepare(sql).bind(...params).all<any>();
      if (res && res.results) {
        return res.results.map((r: any) => ({
          id: r.id,
          brand: r.brand,
          planId: r.plan_id,
          format: r.format as ContentFormat,
          pillar: r.pillar,
          topic: r.topic,
          angle: r.angle,
          hook: r.hook,
          visualFamily: r.visual_family as VisualFamily,
          visualConcept: r.visual_concept,
          fingerprint: r.fingerprint,
          publishedAt: r.published_at,
          status: r.status,
          performanceScore: r.performance_score,
          createdAt: r.created_at
        }));
      }
    } catch (err) {
      console.warn("D1 searchMemory error:", err);
    }
  }

  // In-memory fallback
  return IN_MEMORY_STORE.filter((item) => {
    if (brand && brand !== "All" && item.brand.toLowerCase() !== brand.toLowerCase()) return false;
    if (!cleanQ) return true;
    return (
      item.topic.toLowerCase().includes(cleanQ) ||
      item.angle.toLowerCase().includes(cleanQ) ||
      item.hook.toLowerCase().includes(cleanQ) ||
      item.visualFamily.toLowerCase().includes(cleanQ)
    );
  }).slice(0, 60);
}

/**
 * Return summary statistics on memory for a brand or all brands
 */
export async function getMemoryStats(brand?: string, db?: D1DatabaseLike) {
  const records = await searchMemory(brand, undefined, db);

  const formatCounts: Record<string, number> = { POST: 0, REEL: 0, STORY: 0 };
  const pillarCounts: Record<string, number> = {};
  const familyCounts: Record<string, number> = {};

  for (const r of records) {
    formatCounts[r.format] = (formatCounts[r.format] || 0) + 1;
    pillarCounts[r.pillar] = (pillarCounts[r.pillar] || 0) + 1;
    familyCounts[r.visualFamily] = (familyCounts[r.visualFamily] || 0) + 1;
  }

  return {
    totalRecords: records.length,
    formatCounts,
    pillarCounts,
    familyCounts,
    latestRecord: records[0] || null
  };
}
