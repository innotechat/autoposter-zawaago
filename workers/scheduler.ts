import { Hono } from "hono";
import { sanitizeHistoryError, writeHistory } from "./history";

const SCHEDULE_PREFIX = "schedules/";
type BrandName = "Zawaago" | "InnoTech";
type ScheduleStatus = "scheduled" | "processing" | "published" | "failed" | "cancelled";

type Env = {
  ASSETS?: R2Bucket;
  FB_TOKEN_ZAWAAGO?: string;
  FB_TOKEN_INNOTECH?: string;
  PAGE_ID_ZAWAAGO: string;
  PAGE_ID_INNOTECH: string;
};

type ScheduleRecord = {
  id: string;
  pageName: BrandName;
  pageId: string;
  caption: string;
  imageUrl?: string;
  withImage: boolean;
  scheduledAt: string;
  status: ScheduleStatus;
  createdAt: string;
  publishedAt?: string;
  facebookPostId?: string;
  error?: string;
};

export const schedulerRoutes = new Hono<{ Bindings: Env }>();

function normalizeBrand(value: string): BrandName {
  const v = value.trim().toLowerCase();
  if (v === "zawaago") return "Zawaago";
  if (v === "innotech" || v === "inno tech") return "InnoTech";
  throw new Error("Unsupported Facebook Page. Select Zawaago or InnoTech.");
}

function config(page: BrandName, env: Env) {
  const isInno = page === "InnoTech";
  const pageId = (isInno ? env.PAGE_ID_INNOTECH : env.PAGE_ID_ZAWAAGO)?.trim();
  const token = (isInno ? env.FB_TOKEN_INNOTECH : env.FB_TOKEN_ZAWAAGO)?.trim();
  if (!pageId) throw new Error(`Page ID is not configured for ${page}.`);
  if (!token) throw new Error(`Facebook Page token is not configured for ${page}.`);
  return { pageId, token };
}

function safeId(value: string) {
  if (!/^[a-zA-Z0-9-]{10,100}$/.test(value)) throw new Error("Invalid schedule id.");
  return value;
}

function key(id: string) { return `${SCHEDULE_PREFIX}${id}.json`; }

async function save(env: Env, record: ScheduleRecord) {
  if (!env.ASSETS) throw new Error("Asset storage is not configured.");
  await env.ASSETS.put(key(record.id), JSON.stringify(record), {
    httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
  });
}

async function read(env: Env, id: string) {
  if (!env.ASSETS) throw new Error("Asset storage is not configured.");
  const object = await env.ASSETS.get(key(id));
  if (!object) return null;
  return object.json<ScheduleRecord>();
}

async function publish(record: ScheduleRecord, env: Env) {
  const { pageId, token } = config(record.pageName, env);
  const endpoint = record.withImage ? `https://graph.facebook.com/v20.0/${pageId}/photos` : `https://graph.facebook.com/v20.0/${pageId}/feed`;
  const body = new URLSearchParams({ access_token: token, message: record.caption });
  if (record.withImage) {
    if (!record.imageUrl) throw new Error("Scheduled image post has no image URL.");
    body.set("url", record.imageUrl);
  }
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data?.error?.message || `Facebook returned HTTP ${response.status}.`);
  return String(data.id || data.post_id || "");
}

schedulerRoutes.post("/autoposter/schedules", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const pageName = normalizeBrand(String(body.page || body.pageName || "Zawaago"));
    const caption = String(body.caption || "").trim();
    const imageUrl = String(body.imageUrl || "").trim();
    const withImage = Boolean(body.withImage);
    const scheduledAt = String(body.scheduledAt || "").trim();
    if (!caption) return c.json({ error: "Caption is required." }, 400);
    if (withImage && !imageUrl) return c.json({ error: "Image URL is required for an image schedule." }, 400);
    const date = new Date(scheduledAt);
    if (!scheduledAt || Number.isNaN(date.getTime())) return c.json({ error: "A valid scheduled date/time is required." }, 400);
    if (date.getTime() <= Date.now() + 30_000) return c.json({ error: "Schedule time must be at least 30 seconds in the future." }, 400);
    config(pageName, c.env);
    if (!c.env.ASSETS) return c.json({ error: "Asset storage is not configured." }, 503);

    const record: ScheduleRecord = {
      id: crypto.randomUUID(), pageName, pageId: config(pageName, c.env).pageId,
      caption, ...(imageUrl ? { imageUrl } : {}), withImage,
      scheduledAt: date.toISOString(), status: "scheduled", createdAt: new Date().toISOString(),
    };
    await save(c.env, record);
    return c.json({ ok: true, schedule: record }, 201);
  } catch (error) {
    return c.json({ error: "Schedule creation failed", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

schedulerRoutes.get("/autoposter/schedules", async (c) => {
  try {
    if (!c.env.ASSETS) return c.json({ error: "Asset storage is not configured." }, 503);
    const brand = c.req.query("page");
    const prefix = SCHEDULE_PREFIX;
    const listed = await c.env.ASSETS.list({ prefix, limit: 1000 });
    const records: ScheduleRecord[] = [];
    for (const object of listed.objects) {
      const stored = await c.env.ASSETS.get(object.key);
      if (!stored) continue;
      try {
        const record = await stored.json<ScheduleRecord>();
        if ((!brand || record.pageName === normalizeBrand(brand)) && record.status !== "cancelled") records.push(record);
      } catch { /* ignore malformed schedule objects */ }
    }
    records.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return c.json({ ok: true, schedules: records });
  } catch (error) {
    return c.json({ error: "Could not load schedules", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

schedulerRoutes.delete("/autoposter/schedules/:id", async (c) => {
  try {
    const id = safeId(c.req.param("id"));
    const record = await read(c.env, id);
    if (!record) return c.json({ error: "Schedule not found." }, 404);
    if (record.status !== "scheduled") return c.json({ error: `Schedule is already ${record.status}.` }, 409);
    record.status = "cancelled";
    await save(c.env, record);
    return c.json({ ok: true, id });
  } catch (error) {
    return c.json({ error: "Could not cancel schedule", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

export async function processDueSchedules(env: Env, now = new Date()) {
  if (!env.ASSETS) return { processed: 0, published: 0, failed: 0 };
  const listed = await env.ASSETS.list({ prefix: SCHEDULE_PREFIX, limit: 1000 });
  let processed = 0, published = 0, failed = 0;
  for (const object of listed.objects) {
    const stored = await env.ASSETS.get(object.key);
    if (!stored) continue;
    let record: ScheduleRecord;
    try { record = await stored.json<ScheduleRecord>(); } catch { continue; }
    if (record.status !== "scheduled" || new Date(record.scheduledAt).getTime() > now.getTime()) continue;
    processed += 1;
    record.status = "processing";
    await save(env, record);
    try {
      const facebookPostId = await publish(record, env);
      record.status = "published";
      record.publishedAt = new Date().toISOString();
      record.facebookPostId = facebookPostId;
      await save(env, record);
      await writeHistory(env, {
        id: record.id,
        pageName: record.pageName,
        pageId: record.pageId,
        contentType: record.withImage ? "image" : "text",
        caption: record.caption,
        ...(record.imageUrl ? { imageUrl: record.imageUrl } : {}),
        ...(facebookPostId ? { facebookPostId } : {}),
        status: "published",
        createdAt: record.publishedAt,
      });
      published += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      record.status = "failed";
      record.error = sanitizeHistoryError(message);
      await save(env, record);
      await writeHistory(env, {
        id: record.id,
        pageName: record.pageName,
        pageId: record.pageId,
        contentType: record.withImage ? "image" : "text",
        caption: record.caption,
        ...(record.imageUrl ? { imageUrl: record.imageUrl } : {}),
        status: "failed",
        createdAt: new Date().toISOString(),
        error: sanitizeHistoryError(message),
      });
      failed += 1;
    }
  }
  return { processed, published, failed };
}
