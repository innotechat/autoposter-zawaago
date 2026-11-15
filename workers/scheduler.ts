import { Hono } from "hono";
import { GRAPH_BASE } from "./api";
import { sanitizeHistoryError, writeHistory } from "./history";
import { publishFacebookReel } from "./reels";
import {
  claimPlanForStageD1,
  ensureContentEngineTables,
  getPlanFromD1,
  updatePlanInD1
} from "./content-engine/db";
import { updatePlan } from "./content-engine/autonomous-planner";
import { markJobByPlanId } from "./content-engine/job-orchestrator";
import { markContentMemoryPublished } from "./content-engine/content-memory";
import { isPublicOrigin, resolvePublicOrigin } from "./content-engine/settings";

const SCHEDULE_PREFIX = "schedules/";
type BrandName = "Zawaago" | "InnoTech";
type ScheduleStatus = "scheduled" | "processing" | "published" | "failed" | "cancelled";
type MediaType = "image" | "video";
type Env = {
  ASSETS?: R2Bucket;
  DB?: D1Database;
  PUBLIC_ORIGIN?: string;
  FB_TOKEN_ZAWAAGO?: string;
  FB_TOKEN_INNOTECH?: string;
  PAGE_ID_ZAWAAGO?: string;
  PAGE_ID_INNOTECH?: string;
};
type ScheduleRecord = {
  id: string;
  contentPlanId?: string;
  pageName: BrandName;
  pageId: string;
  caption: string;
  title?: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaType?: MediaType;
  withImage: boolean;
  scheduledAt: string;
  status: ScheduleStatus;
  retryCount?: number;
  nextRetryAt?: string;
  createdAt: string;
  processingStartedAt?: string;
  publishedAt?: string;
  facebookPostId?: string;
  error?: string;
};

export const schedulerRoutes = new Hono<{ Bindings: Env }>();

class ScheduleValidationError extends Error {
  status: 400 | 503;
  constructor(message: string, status: 400 | 503 = 400) {
    super(message);
    this.status = status;
  }
}

function normalizeBrand(value: string): BrandName {
  const v = value.trim().toLowerCase();
  if (v === "zawaago") return "Zawaago";
  if (v === "innotech" || v === "inno tech") return "InnoTech";
  throw new ScheduleValidationError("Unsupported Facebook Page. Select Zawaago or InnoTech.");
}

function config(page: BrandName, env: Env) {
  const isInno = page === "InnoTech";
  const pageId = (isInno ? env.PAGE_ID_INNOTECH : env.PAGE_ID_ZAWAAGO)?.trim();
  const token = (isInno ? env.FB_TOKEN_INNOTECH : env.FB_TOKEN_ZAWAAGO)?.trim();
  if (!pageId) throw new ScheduleValidationError(`Page ID is not configured for ${page}.`);
  if (!token) throw new ScheduleValidationError(`Facebook Page token is not configured for ${page}.`);
  return { pageId, token };
}

function safeId(value: string) {
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(value)) throw new ScheduleValidationError("Invalid schedule id.");
  return value;
}

function key(id: string) {
  return `${SCHEDULE_PREFIX}${id}.json`;
}

async function save(env: Env, record: ScheduleRecord) {
  if (!env.ASSETS) throw new ScheduleValidationError("Asset storage is not configured.", 503);
  await env.ASSETS.put(key(record.id), JSON.stringify(record), {
    httpMetadata: { contentType: "application/json", cacheControl: "no-store" }
  });
}

async function read(env: Env, id: string) {
  if (!env.ASSETS) throw new ScheduleValidationError("Asset storage is not configured.", 503);
  const object = await env.ASSETS.get(key(id));
  if (!object) return null;
  return object.json<ScheduleRecord>();
}

async function listAllScheduleObjects(assets: R2Bucket): Promise<R2Object[]> {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const listed = await assets.list({ prefix: SCHEDULE_PREFIX, limit: 1000, cursor });
    objects.push(...listed.objects);
    cursor = listed.truncated ? listed.cursor : undefined;
    pages += 1;
  } while (cursor && pages < 5);
  return objects;
}

function isPermanentScheduleError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("token is not configured") ||
    lower.includes("page id is not configured") ||
    lower.includes("invalid or expired") ||
    lower.includes("permissions for the selected page") ||
    lower.includes("no longer available in r2") ||
    lower.includes("not an image") ||
    lower.includes("not a") ||
    lower.includes("must be an mp4") ||
    lower.includes("unexpectedly small") ||
    lower.includes("public worker origin") ||
    lower.includes("unsupported")
  );
}

async function validateScheduledImage(
  env: Env,
  imageUrl: string,
  request?: Request,
  fallbackOrigin?: string,
  requirePublicOrigin = false
) {
  if (!imageUrl.trim()) throw new ScheduleValidationError("Image URL is required for an image schedule.");
  if (!env.ASSETS) throw new ScheduleValidationError("Asset storage is not configured.", 503);
  const requestOrigin = request ? new URL(request.url).origin : fallbackOrigin || "";
  let url: URL;
  try {
    url = new URL(imageUrl, requestOrigin || "https://assets.local");
  } catch {
    throw new ScheduleValidationError("Scheduled image URL is invalid.");
  }
  const prefix = "/api/autoposter/assets/";
  if (!url.pathname.startsWith(prefix)) {
    throw new ScheduleValidationError("Scheduled image must be a valid R2 asset generated by this Autoposter.");
  }
  const encodedKey = url.pathname.slice(prefix.length);
  let objectKey = "";
  try {
    objectKey = decodeURIComponent(encodedKey);
  } catch {
    throw new ScheduleValidationError("Scheduled image URL is invalid.");
  }
  if (!objectKey.startsWith("generated/") || objectKey.includes("..")) {
    throw new ScheduleValidationError("Scheduled image must reference a generated R2 asset.");
  }
  const object = await env.ASSETS.get(objectKey);
  if (!object) throw new ScheduleValidationError("Scheduled image is no longer available in R2. Generate the visual again.");
  const contentType = object.httpMetadata?.contentType || "";
  if (contentType && !contentType.toLowerCase().startsWith("image/")) {
    throw new ScheduleValidationError("Scheduled R2 asset is not an image.");
  }
  if (object.size <= 1000) {
    throw new ScheduleValidationError("Scheduled image asset is unexpectedly small. Regenerate the visual.");
  }

  const effectiveOrigin =
    (fallbackOrigin && isPublicOrigin(fallbackOrigin) ? fallbackOrigin : "") ||
    (requestOrigin && isPublicOrigin(requestOrigin) ? requestOrigin : "") ||
    (isPublicOrigin(url.origin) ? url.origin : "") ||
    requestOrigin;

  if (requirePublicOrigin && !isPublicOrigin(effectiveOrigin)) {
    throw new ScheduleValidationError("Public Worker origin is not configured yet for scheduled image publishing.");
  }
  if (effectiveOrigin) {
    return `${effectiveOrigin.replace(/\/+$/, "")}${url.pathname}${url.search}`;
  }
  throw new ScheduleValidationError("Public Worker origin is not configured yet for scheduled image publishing.");
}

async function validateScheduledVideo(
  env: Env,
  videoUrl: string,
  request?: Request,
  fallbackOrigin?: string,
  requirePublicOrigin = false
) {
  if (!videoUrl.trim()) throw new ScheduleValidationError("Video URL is required for a Reel schedule.");
  if (!env.ASSETS) throw new ScheduleValidationError("Asset storage is not configured.", 503);
  const requestOrigin = request ? new URL(request.url).origin : fallbackOrigin || "";
  let url: URL;
  try {
    url = new URL(videoUrl, requestOrigin || "https://assets.local");
  } catch {
    throw new ScheduleValidationError("Scheduled Reel URL is invalid.");
  }
  const prefix = "/api/autoposter/assets/";
  if (!url.pathname.startsWith(prefix)) {
    throw new ScheduleValidationError("Scheduled Reel must be a valid R2 asset generated by this Autoposter.");
  }
  let objectKey = "";
  try {
    objectKey = decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    throw new ScheduleValidationError("Scheduled Reel URL is invalid.");
  }
  if (!objectKey.startsWith("generated/") || objectKey.includes("..")) {
    throw new ScheduleValidationError("Scheduled Reel must reference a generated R2 asset.");
  }
  const object = await env.ASSETS.get(objectKey);
  if (!object) throw new ScheduleValidationError("Scheduled Reel is no longer available in R2.");
  const contentType = (object.httpMetadata?.contentType || "").toLowerCase();
  if (contentType && contentType !== "video/mp4") throw new ScheduleValidationError("Scheduled Reel must be an MP4 asset.");
  if (object.size <= 1000) throw new ScheduleValidationError("Scheduled Reel asset is unexpectedly small.");

  const effectiveOrigin =
    (fallbackOrigin && isPublicOrigin(fallbackOrigin) ? fallbackOrigin : "") ||
    (requestOrigin && isPublicOrigin(requestOrigin) ? requestOrigin : "") ||
    (isPublicOrigin(url.origin) ? url.origin : "") ||
    requestOrigin;

  if (requirePublicOrigin && !isPublicOrigin(effectiveOrigin)) {
    throw new ScheduleValidationError("Public Worker origin is not configured yet for scheduled Reel publishing.");
  }
  return effectiveOrigin ? `${effectiveOrigin.replace(/\/+$/, "")}${url.pathname}${url.search}` : url.toString();
}

async function publish(record: ScheduleRecord, env: Env, validatedImageUrl?: string) {
  const { pageId, token } = config(record.pageName, env);
  const endpoint = record.withImage
    ? `${GRAPH_BASE}/${encodeURIComponent(pageId)}/photos`
    : `${GRAPH_BASE}/${encodeURIComponent(pageId)}/feed`;
  const body = new URLSearchParams({ access_token: token, message: record.caption });
  if (record.withImage) {
    const imgUrl = validatedImageUrl || record.imageUrl;
    if (!imgUrl) throw new Error("Scheduled image post has no image URL.");
    body.set("url", imgUrl);
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const code = data?.error?.code;
    if (code === 190) throw new Error("Facebook rejected the Page token because it is invalid or expired.");
    if (code === 200) throw new Error("Facebook rejected the Page token or its permissions for the selected Page.");
    if (code === 10) throw new Error("Facebook rejected this operation. Verify Page publishing permissions.");
    throw new Error(data?.error?.message || `Facebook returned HTTP ${response.status}.`);
  }
  return { facebookPostId: String(data.id || data.post_id || ""), pageId };
}

schedulerRoutes.post("/autoposter/schedules", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const pageName = normalizeBrand(String(body.page || body.pageName || "Zawaago"));
    const caption = String(body.caption || "").trim();
    let imageUrl = String(body.imageUrl || "").trim();
    const withImage = Boolean(body.withImage);
    const scheduledAt = String(body.scheduledAt || "").trim();
    if (!caption) return c.json({ error: "Caption is required." }, 400);
    if (withImage) imageUrl = await validateScheduledImage(c.env, imageUrl, c.req.raw);
    const date = new Date(scheduledAt);
    if (!scheduledAt || Number.isNaN(date.getTime())) return c.json({ error: "A valid scheduled date/time is required." }, 400);
    if (date.getTime() <= Date.now() + 30_000) return c.json({ error: "Schedule time must be at least 30 seconds in the future." }, 400);
    const cfg = config(pageName, c.env);
    if (!c.env.ASSETS) return c.json({ error: "Asset storage is not configured." }, 503);
    const record: ScheduleRecord = {
      id: crypto.randomUUID(),
      pageName,
      pageId: cfg.pageId,
      caption,
      ...(withImage && imageUrl ? { imageUrl } : {}),
      withImage,
      scheduledAt: date.toISOString(),
      status: "scheduled",
      retryCount: 0,
      createdAt: new Date().toISOString()
    };
    await save(c.env, record);
    return c.json({ ok: true, schedule: record }, 201);
  } catch (error) {
    const status = error instanceof ScheduleValidationError ? error.status : 500;
    return c.json({ error: "Schedule creation failed", details: error instanceof Error ? error.message : String(error) }, status);
  }
});

schedulerRoutes.post("/autoposter/schedules/reel", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const pageName = normalizeBrand(String(body.page || body.pageName || "Zawaago"));
    const caption = String(body.caption || body.description || "").trim();
    const rawVideoUrl = String(body.videoUrl || "").trim();
    const title = String(body.title || "").trim().slice(0, 100);
    const scheduledAt = String(body.scheduledAt || "").trim();
    if (!caption) return c.json({ error: "Reel caption is required." }, 400);
    const videoUrl = await validateScheduledVideo(c.env, rawVideoUrl, c.req.raw);
    const date = new Date(scheduledAt);
    if (!scheduledAt || Number.isNaN(date.getTime())) return c.json({ error: "A valid scheduled date/time is required." }, 400);
    if (date.getTime() <= Date.now() + 30_000) return c.json({ error: "Schedule time must be at least 30 seconds in the future." }, 400);
    const cfg = config(pageName, c.env);
    const record: ScheduleRecord = {
      id: crypto.randomUUID(),
      pageName,
      pageId: cfg.pageId,
      caption,
      ...(title ? { title } : {}),
      videoUrl,
      mediaType: "video",
      withImage: false,
      scheduledAt: date.toISOString(),
      status: "scheduled",
      retryCount: 0,
      createdAt: new Date().toISOString()
    };
    await save(c.env, record);
    return c.json({ ok: true, schedule: record }, 201);
  } catch (error) {
    const status = error instanceof ScheduleValidationError ? error.status : 500;
    return c.json({ error: "Reel schedule creation failed", details: error instanceof Error ? error.message : String(error) }, status);
  }
});

schedulerRoutes.get("/autoposter/schedules", async (c) => {
  try {
    if (!c.env.ASSETS) return c.json({ error: "Asset storage is not configured." }, 503);
    const brand = c.req.query("page");
    const targetBrand = brand ? normalizeBrand(brand) : null;
    const objects = await listAllScheduleObjects(c.env.ASSETS);
    const loaded = await Promise.all(
      objects.map(async (object) => {
        const stored = await c.env.ASSETS!.get(object.key);
        if (!stored) return null;
        try {
          return await stored.json<ScheduleRecord>();
        } catch {
          return null;
        }
      })
    );
    const records = loaded.filter(
      (record): record is ScheduleRecord =>
        Boolean(record) &&
        (!targetBrand || record!.pageName === targetBrand) &&
        record!.status !== "cancelled"
    );
    records.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return c.json({ ok: true, schedules: records });
  } catch (error) {
    const status = error instanceof ScheduleValidationError ? error.status : 500;
    return c.json({ error: "Could not load schedules", details: error instanceof Error ? error.message : String(error) }, status);
  }
});

schedulerRoutes.patch("/autoposter/schedules/:id", async (c) => {
  try {
    const id = safeId(c.req.param("id"));
    const record = await read(c.env, id);
    if (!record) return c.json({ error: "Schedule not found." }, 404);
    if (record.status !== "scheduled" && record.status !== "failed") {
      return c.json({ error: `Cannot edit a schedule that is ${record.status}.` }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    let nextScheduledAt = record.scheduledAt;
    if (typeof body.scheduledAt === "string" && body.scheduledAt.trim()) {
      const date = new Date(body.scheduledAt.trim());
      if (Number.isNaN(date.getTime())) return c.json({ error: "A valid scheduled date/time is required." }, 400);
      if (date.getTime() <= Date.now() + 30_000) {
        return c.json({ error: "Schedule time must be at least 30 seconds in the future." }, 400);
      }
      nextScheduledAt = date.toISOString();
    }

    const nextCaption = typeof body.caption === "string" ? body.caption.trim() : record.caption;
    if (!nextCaption) return c.json({ error: "Caption cannot be empty." }, 400);

    const updated: ScheduleRecord = {
      ...record,
      caption: nextCaption,
      ...(typeof body.title === "string" && record.mediaType === "video"
        ? { title: body.title.trim().slice(0, 100) || undefined }
        : {}),
      scheduledAt: nextScheduledAt,
      status: "scheduled",
      retryCount: 0,
      nextRetryAt: undefined,
      error: undefined
    };
    await save(c.env, updated);

    const planId = updated.contentPlanId || (id.startsWith("plan-") ? id : undefined);
    if (planId) {
      updatePlan(planId, {
        scheduledFor: nextScheduledAt,
        generatedCaption: updated.mediaType !== "video" ? nextCaption : undefined,
        status: "SCHEDULED",
        retryCount: 0,
        nextRetryAt: undefined,
        errorMessage: undefined
      });
      if (c.env.DB) {
        await updatePlanInD1(
          planId,
          {
            scheduledFor: nextScheduledAt,
            ...(updated.mediaType !== "video" ? { generatedCaption: nextCaption } : {}),
            status: "SCHEDULED",
            retryCount: 0,
            nextRetryAt: undefined,
            errorMessage: undefined
          },
          c.env.DB
        );
      }
    }

    return c.json({ ok: true, schedule: updated });
  } catch (error) {
    const status = error instanceof ScheduleValidationError ? error.status : 500;
    return c.json({ error: "Could not update schedule", details: error instanceof Error ? error.message : String(error) }, status);
  }
});

schedulerRoutes.post("/autoposter/schedules/:id/retry", async (c) => {
  try {
    const id = safeId(c.req.param("id"));
    const record = await read(c.env, id);
    if (!record) return c.json({ error: "Schedule not found." }, 404);
    if (record.status === "published" || record.facebookPostId) {
      return c.json({ error: `Schedule is already published (ID: ${record.facebookPostId || "synced"}).` }, 409);
    }
    if (record.status === "processing" || record.status === "cancelled") {
      return c.json({ error: `Cannot retry schedule while ${record.status}.` }, 409);
    }

    const planId = record.contentPlanId || (id.startsWith("plan-") ? id : undefined);
    if (planId && c.env.DB) {
      await ensureContentEngineTables(c.env.DB);
      const existingPlan = await getPlanFromD1(planId, c.env.DB);
      if (existingPlan?.facebookPostId || existingPlan?.status === "PUBLISHED") {
        const synced: ScheduleRecord = {
          ...record,
          status: "published",
          publishedAt: existingPlan.publishedAt || new Date().toISOString(),
          facebookPostId: existingPlan.facebookPostId,
          processingStartedAt: undefined,
          error: undefined
        };
        await save(c.env, synced);
        return c.json({ ok: true, alreadyPublished: true, schedule: synced });
      }
    }

    const body = await c.req.json().catch(() => ({}));
    const runNow = body.runNow !== false;
    const now = new Date();
    const effectiveScheduledAt =
      new Date(record.scheduledAt).getTime() <= now.getTime() ? record.scheduledAt : now.toISOString();

    const resetRecord: ScheduleRecord = {
      ...record,
      scheduledAt: effectiveScheduledAt,
      status: "scheduled",
      retryCount: 0,
      nextRetryAt: undefined,
      processingStartedAt: undefined,
      error: undefined
    };
    await save(c.env, resetRecord);

    if (planId) {
      updatePlan(planId, {
        status: "SCHEDULED",
        retryCount: 0,
        nextRetryAt: undefined,
        errorMessage: undefined,
        processingStartedAt: undefined
      });
      if (c.env.DB) {
        await updatePlanInD1(
          planId,
          {
            status: "SCHEDULED",
            retryCount: 0,
            nextRetryAt: undefined,
            errorMessage: undefined,
            processingStartedAt: undefined
          },
          c.env.DB
        );
      }
    }

    if (!runNow) {
      return c.json({ ok: true, schedule: resetRecord });
    }

    const origin = new URL(c.req.url).origin;
    const object = await c.env.ASSETS!.get(key(id));
    if (!object) return c.json({ error: "Schedule disappeared before retry." }, 404);
    const result = await processSingleScheduledObject(c.env, key(id), object, now, origin);
    const latest = await read(c.env, id);
    return c.json({ ok: result !== "failed", outcome: result, schedule: latest || resetRecord }, result === "failed" ? 500 : 200);
  } catch (error) {
    const status = error instanceof ScheduleValidationError ? error.status : 500;
    return c.json({ error: "Could not retry schedule", details: error instanceof Error ? error.message : String(error) }, status);
  }
});

schedulerRoutes.delete("/autoposter/schedules/:id", async (c) => {
  try {
    const id = safeId(c.req.param("id"));
    const record = await read(c.env, id);
    if (!record) return c.json({ error: "Schedule not found." }, 404);
    if (record.status !== "scheduled" && record.status !== "failed") {
      return c.json({ error: `Schedule is already ${record.status}.` }, 409);
    }
    record.status = "cancelled";
    record.processingStartedAt = undefined;
    await save(c.env, record);
    if (record.contentPlanId || id.startsWith("plan-")) {
      const planId = record.contentPlanId || id;
      updatePlan(planId, { status: "CANCELLED" });
      if (c.env.DB) await updatePlanInD1(planId, { status: "CANCELLED" }, c.env.DB);
      await markJobByPlanId(planId, "CANCELLED", "CANCELLED", "Schedule cancelled by user.", {}, c.env.DB);
    }
    return c.json({ ok: true, id });
  } catch (error) {
    const status = error instanceof ScheduleValidationError ? error.status : 500;
    return c.json({ error: "Could not cancel schedule", details: error instanceof Error ? error.message : String(error) }, status);
  }
});

schedulerRoutes.post("/autoposter/schedules/process-due", async (c) => {
  try {
    const origin = new URL(c.req.url).origin;
    const result = await processDueSchedules(c.env, new Date(), origin);
    return c.json({ ok: true, ...result });
  } catch (error) {
    return c.json({ error: "Schedule processing failed", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function claimScheduledRecord(env: Env, objectKey: string, stored: R2Object, record: ScheduleRecord, now: Date) {
  if (!env.ASSETS) return false;
  const claimed: ScheduleRecord = {
    ...record,
    status: "processing",
    processingStartedAt: now.toISOString(),
    error: undefined
  };
  const result = await env.ASSETS.put(objectKey, JSON.stringify(claimed), {
    onlyIf: { etagMatches: stored.etag },
    httpMetadata: { contentType: "application/json", cacheControl: "no-store" }
  });
  return !!result;
}

async function recoverStaleProcessing(env: Env, objectKey: string, stored: R2Object, record: ScheduleRecord, now: Date) {
  if (!env.ASSETS || record.status !== "processing" || !record.processingStartedAt) return false;
  const started = new Date(record.processingStartedAt).getTime();
  if (!Number.isFinite(started) || now.getTime() - started < 10 * 60 * 1000) return false;
  const recovered: ScheduleRecord = {
    ...record,
    status: "scheduled",
    processingStartedAt: undefined,
    error: "Recovered stale scheduler claim."
  };
  const result = await env.ASSETS.put(objectKey, JSON.stringify(recovered), {
    onlyIf: { etagMatches: stored.etag },
    httpMetadata: { contentType: "application/json", cacheControl: "no-store" }
  });
  return !!result;
}

async function processSingleScheduledObject(
  env: Env,
  objectKey: string,
  stored: R2ObjectBody,
  now: Date,
  requestOrigin?: string
): Promise<"skipped" | "published" | "retrying" | "failed"> {
  let record: ScheduleRecord;
  try {
    record = await stored.json<ScheduleRecord>();
  } catch {
    return "skipped";
  }

  if (await recoverStaleProcessing(env, objectKey, stored, record, now)) return "skipped";
  if (record.status !== "scheduled") return "skipped";
  if (new Date(record.scheduledAt).getTime() > now.getTime()) return "skipped";
  if (record.nextRetryAt && new Date(record.nextRetryAt).getTime() > now.getTime()) return "skipped";

  const claimed = await claimScheduledRecord(env, objectKey, stored, record, now);
  if (!claimed) return "skipped";

  const planId = record.contentPlanId || (record.id.startsWith("plan-") ? record.id : undefined);
  const publicOrigin = await resolvePublicOrigin(env, requestOrigin);
  const fallbackPageId = (record.pageName === "InnoTech" ? env.PAGE_ID_INNOTECH : env.PAGE_ID_ZAWAAGO)?.trim() || "";
  const processingRecord: ScheduleRecord = {
    ...record,
    pageId: record.pageId || fallbackPageId,
    status: "processing",
    processingStartedAt: now.toISOString(),
    error: undefined
  };

  try {
    const cfg = config(record.pageName, env);
    processingRecord.pageId = processingRecord.pageId || cfg.pageId;

    // Idempotency & concurrency guard for linked Content Engine plan
    if (planId && env.DB) {
      const existingPlan = await getPlanFromD1(planId, env.DB);
      if (existingPlan?.facebookPostId || existingPlan?.status === "PUBLISHED") {
        await save(env, {
          ...processingRecord,
          status: "published",
          processingStartedAt: undefined,
          publishedAt: existingPlan.publishedAt || now.toISOString(),
          facebookPostId: existingPlan.facebookPostId,
          error: undefined
        });
        return "skipped";
      }
      if (existingPlan?.status === "CANCELLED") {
        await save(env, {
          ...processingRecord,
          status: "cancelled",
          processingStartedAt: undefined
        });
        return "skipped";
      }
      const planClaimed = await claimPlanForStageD1(
        planId,
        ["SCHEDULED", "READY", "GENERATING", "RETRYING", "PLANNED", "APPROVED"],
        "PUBLISHING",
        env.DB
      );
      if (!planClaimed) {
        const latestPlan = await getPlanFromD1(planId, env.DB);
        if (latestPlan?.facebookPostId || latestPlan?.status === "PUBLISHED") {
          await save(env, {
            ...processingRecord,
            status: "published",
            processingStartedAt: undefined,
            publishedAt: latestPlan.publishedAt || now.toISOString(),
            facebookPostId: latestPlan.facebookPostId,
            error: undefined
          });
          return "skipped";
        }
        // Another execution is actively publishing right now; release our R2 claim quietly
        await save(env, {
          ...record,
          processingStartedAt: undefined
        });
        return "skipped";
      }
    }

    if (processingRecord.mediaType === "video") {
      if (!processingRecord.videoUrl) throw new Error("Scheduled Reel has no video URL.");
      const verifiedVideoUrl = await validateScheduledVideo(env, processingRecord.videoUrl, undefined, publicOrigin, true);
      const result = await publishFacebookReel(
        {
          ...env,
          PAGE_ID_ZAWAAGO: env.PAGE_ID_ZAWAAGO || "",
          PAGE_ID_INNOTECH: env.PAGE_ID_INNOTECH || ""
        },
        processingRecord.pageName,
        verifiedVideoUrl,
        processingRecord.caption,
        processingRecord.title || ""
      );
      const publishedAt = new Date().toISOString();
      const publishedRecord: ScheduleRecord = {
        ...processingRecord,
        videoUrl: verifiedVideoUrl,
        status: "published",
        processingStartedAt: undefined,
        publishedAt,
        facebookPostId: result.videoId,
        error: undefined
      };
      await save(env, publishedRecord);
      await writeHistory(env, {
        id: publishedRecord.id,
        pageName: publishedRecord.pageName,
        pageId: publishedRecord.pageId,
        contentType: "reel",
        caption: publishedRecord.caption,
        ...(publishedRecord.videoUrl ? { videoUrl: publishedRecord.videoUrl } : {}),
        ...(result.videoId ? { facebookPostId: result.videoId } : {}),
        status: "published",
        createdAt: publishedAt
      });
      if (planId) {
        updatePlan(planId, {
          status: "PUBLISHED",
          facebookPostId: result.videoId,
          facebookVideoId: result.videoId,
          publishedAt,
          processingStartedAt: undefined
        });
        if (env.DB) {
          await updatePlanInD1(
            planId,
            {
              status: "PUBLISHED",
              facebookPostId: result.videoId,
              facebookVideoId: result.videoId,
              publishedAt,
              processingStartedAt: undefined
            },
            env.DB
          );
        }
        await markJobByPlanId(
          planId,
          "PUBLISHED",
          "PUBLISHED",
          `Scheduled Reel published (ID: ${result.videoId})`,
          { facebookPostId: result.videoId, publishedAt },
          env.DB
        );
        await markContentMemoryPublished(planId, publishedAt, env.DB);
      }
      return "published";
    }

    let verifiedImageUrl = processingRecord.imageUrl;
    if (processingRecord.withImage) {
      if (!processingRecord.imageUrl) throw new Error("Scheduled image post has no image URL.");
      verifiedImageUrl = await validateScheduledImage(env, processingRecord.imageUrl, undefined, publicOrigin, true);
    }

    const pubRes = await publish(processingRecord, env, verifiedImageUrl);
    const publishedAt = new Date().toISOString();
    const publishedRecord: ScheduleRecord = {
      ...processingRecord,
      ...(verifiedImageUrl ? { imageUrl: verifiedImageUrl } : {}),
      status: "published",
      processingStartedAt: undefined,
      publishedAt,
      facebookPostId: pubRes.facebookPostId,
      error: undefined
    };
    await save(env, publishedRecord);
    await writeHistory(env, {
      id: publishedRecord.id,
      pageName: publishedRecord.pageName,
      pageId: pubRes.pageId,
      contentType: publishedRecord.withImage ? "image" : "text",
      caption: publishedRecord.caption,
      ...(publishedRecord.imageUrl ? { imageUrl: publishedRecord.imageUrl } : {}),
      ...(pubRes.facebookPostId ? { facebookPostId: pubRes.facebookPostId } : {}),
      status: "published",
      createdAt: publishedAt
    });

    if (planId) {
      updatePlan(planId, {
        status: "PUBLISHED",
        facebookPostId: pubRes.facebookPostId,
        publishedAt,
        retryCount: 0,
        nextRetryAt: undefined,
        errorMessage: undefined,
        processingStartedAt: undefined
      });
      if (env.DB) {
        await updatePlanInD1(
          planId,
          {
            status: "PUBLISHED",
            facebookPostId: pubRes.facebookPostId,
            publishedAt,
            retryCount: 0,
            nextRetryAt: undefined,
            errorMessage: undefined,
            processingStartedAt: undefined
          },
          env.DB
        );
      }
      await markJobByPlanId(
        planId,
        "PUBLISHED",
        "PUBLISHED",
        `Scheduled post published to Facebook (ID: ${pubRes.facebookPostId})`,
        { facebookPostId: pubRes.facebookPostId, publishedAt, errorMessage: undefined, nextRetryAt: null },
        env.DB
      );
      await markContentMemoryPublished(planId, publishedAt, env.DB);
    }
    return "published";
  } catch (error) {
    const message = sanitizeHistoryError(error instanceof Error ? error.message : String(error));
    const nextRetryCount = Number(processingRecord.retryCount || 0) + 1;
    const canRetry = !isPermanentScheduleError(message) && nextRetryCount < 3;
    const nextRetryAt = canRetry ? new Date(now.getTime() + nextRetryCount * 3 * 60_000).toISOString() : undefined;

    const failedOrRetryRecord: ScheduleRecord = {
      ...processingRecord,
      status: canRetry ? "scheduled" : "failed",
      retryCount: nextRetryCount,
      nextRetryAt,
      processingStartedAt: undefined,
      error: message
    };
    await save(env, failedOrRetryRecord);

    if (!canRetry) {
      await writeHistory(env, {
        id: failedOrRetryRecord.id,
        pageName: failedOrRetryRecord.pageName,
        pageId: failedOrRetryRecord.pageId,
        contentType: failedOrRetryRecord.mediaType === "video" ? "reel" : failedOrRetryRecord.withImage ? "image" : "text",
        caption: failedOrRetryRecord.caption,
        ...(failedOrRetryRecord.imageUrl ? { imageUrl: failedOrRetryRecord.imageUrl } : {}),
        ...(failedOrRetryRecord.videoUrl ? { videoUrl: failedOrRetryRecord.videoUrl } : {}),
        status: "failed",
        createdAt: new Date().toISOString(),
        error: message
      });
    }

    if (planId) {
      const d1State = canRetry ? "RETRYING" : "FAILED";
      updatePlan(planId, {
        status: d1State,
        retryCount: nextRetryCount,
        nextRetryAt,
        errorMessage: message,
        processingStartedAt: undefined
      });
      if (env.DB) {
        await updatePlanInD1(
          planId,
          {
            status: d1State,
            retryCount: nextRetryCount,
            nextRetryAt,
            errorMessage: message,
            processingStartedAt: undefined
          },
          env.DB
        );
      }
      await markJobByPlanId(
        planId,
        d1State,
        "SCHEDULE_ERROR",
        `${canRetry ? `Retry ${nextRetryCount}/3` : "Scheduled publish failed"}: ${message}`,
        { retryCount: nextRetryCount, errorMessage: message, nextRetryAt: nextRetryAt || null },
        env.DB
      );
    }

    return canRetry ? "retrying" : "failed";
  }
}

export async function processDueSchedules(env: Env, now = new Date(), requestOrigin?: string) {
  if (!env.ASSETS) return { processed: 0, published: 0, retrying: 0, failed: 0 };
  if (env.DB) await ensureContentEngineTables(env.DB);
  const objects = await listAllScheduleObjects(env.ASSETS);
  let processed = 0,
    published = 0,
    retrying = 0,
    failed = 0;

  for (const object of objects) {
    const stored = await env.ASSETS.get(object.key);
    if (!stored) continue;
    const outcome = await processSingleScheduledObject(env, object.key, stored, now, requestOrigin);
    if (outcome === "skipped") continue;
    processed += 1;
    if (outcome === "published") published += 1;
    else if (outcome === "retrying") retrying += 1;
    else failed += 1;
  }

  return { processed, published, retrying, failed };
}
