export type ReelStatus = "ready" | "scheduled" | "published" | "failed";

export type ReelHistoryRecord = {
  id: string;
  brand: "Zawaago" | "InnoTech" | "None" | "Custom";
  topic: string;
  title: string;
  language: string;
  durationSeconds: number;
  videoUrl: string;
  r2Key?: string;
  thumbnailUrl?: string;
  caption?: string;
  scenesJson?: string;
  status: ReelStatus;
  facebookVideoId?: string;
  scheduledAt?: string;
  createdAt: string;
};

type EnvWithD1 = {
  DB?: D1Database;
  ASSETS?: R2Bucket;
};

let tableInitialized = false;

export async function ensureReelsTable(db?: D1Database): Promise<void> {
  if (!db || tableInitialized) return;
  try {
    // Execute CREATE TABLE as a clean, single-line DDL query
    await db.prepare(
      "CREATE TABLE IF NOT EXISTS reels_history (" +
      "id TEXT PRIMARY KEY, " +
      "brand TEXT NOT NULL, " +
      "topic TEXT NOT NULL, " +
      "title TEXT NOT NULL, " +
      "language TEXT NOT NULL, " +
      "duration_seconds INTEGER NOT NULL DEFAULT 35, " +
      "video_url TEXT NOT NULL, " +
      "r2_key TEXT, " +
      "thumbnail_url TEXT, " +
      "caption TEXT, " +
      "scenes_json TEXT, " +
      "status TEXT DEFAULT 'ready', " +
      "facebook_video_id TEXT, " +
      "scheduled_at TEXT, " +
      "created_at TEXT DEFAULT (datetime('now'))" +
      ")"
    ).run();

    // Execute separate index queries safely
    try {
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_reels_brand ON reels_history(brand)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_reels_status ON reels_history(status)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_reels_created ON reels_history(created_at DESC)").run();
    } catch {
      // Non-blocking index creation
    }

    tableInitialized = true;
  } catch (err) {
    console.warn("D1 table init warning:", err);
  }
}

function r2HistoryKey(brand: string, id: string) {
  const safeBrand = (brand || "none").toLowerCase();
  return `reels_history/${safeBrand}/${id}.json`;
}

export async function persistReelRecord(
  env: EnvWithD1,
  record: ReelHistoryRecord
): Promise<ReelHistoryRecord> {
  // 1. Persist to Cloudflare D1 if bound
  if (env.DB) {
    try {
      await ensureReelsTable(env.DB);
      await env.DB.prepare(`
        INSERT INTO reels_history (
          id, brand, topic, title, language, duration_seconds, video_url, r2_key,
          thumbnail_url, caption, scenes_json, status, facebook_video_id, scheduled_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          facebook_video_id = COALESCE(excluded.facebook_video_id, reels_history.facebook_video_id),
          scheduled_at = COALESCE(excluded.scheduled_at, reels_history.scheduled_at),
          caption = COALESCE(excluded.caption, reels_history.caption)
      `).bind(
        record.id,
        record.brand,
        record.topic,
        record.title,
        record.language,
        record.durationSeconds,
        record.videoUrl,
        record.r2Key || null,
        record.thumbnailUrl || null,
        record.caption || null,
        record.scenesJson || null,
        record.status,
        record.facebookVideoId || null,
        record.scheduledAt || null,
        record.createdAt
      ).run();
    } catch (err) {
      console.warn("D1 write failed, relying on R2 fallback:", err);
    }
  }

  // 2. Dual-persistence to R2 for maximum safety and zero data loss
  if (env.ASSETS) {
    try {
      const key = r2HistoryKey(record.brand, record.id);
      await env.ASSETS.put(key, JSON.stringify(record), {
        httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
        customMetadata: { brand: record.brand, status: record.status },
      });
    } catch (err) {
      console.warn("R2 backup write failed:", err);
    }
  }

  return record;
}

export async function listReelRecords(
  env: EnvWithD1,
  brand?: string,
  limit = 50
): Promise<ReelHistoryRecord[]> {
  const safeLimit = Math.min(100, Math.max(1, limit));

  // 1. Attempt D1 relational query
  if (env.DB) {
    try {
      await ensureReelsTable(env.DB);
      let query = "SELECT * FROM reels_history";
      const params: any[] = [];
      if (brand && brand !== "All") {
        query += " WHERE brand = ?";
        params.push(brand);
      }
      query += " ORDER BY created_at DESC LIMIT ?";
      params.push(safeLimit);

      const res = await env.DB.prepare(query).bind(...params).all<any>();
      if (res.results && Array.isArray(res.results)) {
        return res.results.map((row) => ({
          id: String(row.id),
          brand: row.brand as ReelHistoryRecord["brand"],
          topic: String(row.topic || ""),
          title: String(row.title || ""),
          language: String(row.language || "English"),
          durationSeconds: Number(row.duration_seconds || 35),
          videoUrl: String(row.video_url || ""),
          r2Key: row.r2_key ? String(row.r2_key) : undefined,
          thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : undefined,
          caption: row.caption ? String(row.caption) : undefined,
          scenesJson: row.scenes_json ? String(row.scenes_json) : undefined,
          status: (row.status as ReelStatus) || "ready",
          facebookVideoId: row.facebook_video_id ? String(row.facebook_video_id) : undefined,
          scheduledAt: row.scheduled_at ? String(row.scheduled_at) : undefined,
          createdAt: String(row.created_at || new Date().toISOString()),
        }));
      }
    } catch (err) {
      console.warn("D1 query failed, falling back to R2 storage:", err);
    }
  }

  // 2. Fallback: R2 JSON metadata listing
  if (env.ASSETS) {
    try {
      const prefix = brand && brand !== "All"
        ? `reels_history/${brand.toLowerCase()}/`
        : "reels_history/";
      const listed = await env.ASSETS.list({ prefix, limit: safeLimit });
      const records: ReelHistoryRecord[] = [];
      for (const obj of listed.objects) {
        const item = await env.ASSETS.get(obj.key);
        if (!item) continue;
        try {
          const rec = await item.json<ReelHistoryRecord>();
          if (rec && rec.id && rec.videoUrl) {
            records.push(rec);
          }
        } catch {
          // ignore corrupted files
        }
      }
      records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return records;
    } catch (err) {
      console.warn("R2 list fallback failed:", err);
    }
  }

  return [];
}

export async function deleteReelRecord(
  env: EnvWithD1,
  id: string,
  brand: string
): Promise<{ ok: boolean; deletedAssetKey?: string }> {
  let deletedAssetKey: string | undefined;

  // 1. Get record to find r2Key
  let r2KeyToDelete: string | undefined;
  if (env.DB) {
    try {
      await ensureReelsTable(env.DB);
      const row = await env.DB.prepare("SELECT r2_key FROM reels_history WHERE id = ?").bind(id).first<any>();
      if (row?.r2_key) r2KeyToDelete = String(row.r2_key);
    } catch {}
  }

  // 2. Delete media binary from R2 if found
  if (r2KeyToDelete && env.ASSETS) {
    try {
      await env.ASSETS.delete(r2KeyToDelete);
      deletedAssetKey = r2KeyToDelete;
    } catch (err) {
      console.warn("Could not delete R2 MP4 video file:", err);
    }
  }

  // 3. Delete from D1
  if (env.DB) {
    try {
      await env.DB.prepare("DELETE FROM reels_history WHERE id = ?").bind(id).run();
    } catch (err) {
      console.warn("D1 delete failed:", err);
    }
  }

  // 4. Delete JSON record from R2
  if (env.ASSETS) {
    try {
      const key = r2HistoryKey(brand, id);
      await env.ASSETS.delete(key);
    } catch (err) {
      console.warn("R2 record delete failed:", err);
    }
  }

  return { ok: true, deletedAssetKey };
}

export async function updateReelStatusByUrl(
  env: EnvWithD1,
  videoUrl: string,
  status: ReelStatus,
  extra?: { facebookVideoId?: string; scheduledAt?: string }
): Promise<void> {
  if (env.DB) {
    try {
      await ensureReelsTable(env.DB);
      await env.DB.prepare(`
        UPDATE reels_history
        SET status = ?,
            facebook_video_id = COALESCE(?, facebook_video_id),
            scheduled_at = COALESCE(?, scheduled_at)
        WHERE video_url = ? OR video_url LIKE ?
      `).bind(
        status,
        extra?.facebookVideoId || null,
        extra?.scheduledAt || null,
        videoUrl,
        `%${videoUrl.split("/").pop()}%`
      ).run();
    } catch (err) {
      console.warn("D1 status update failed:", err);
    }
  }
}
