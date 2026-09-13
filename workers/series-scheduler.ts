import { Hono } from "hono";

const PREFIX = "schedules/";
type BrandName = "Zawaago" | "InnoTech";
type Env = { ASSETS?: R2Bucket; FB_TOKEN_ZAWAAGO?: string; FB_TOKEN_INNOTECH?: string; PAGE_ID_ZAWAAGO: string; PAGE_ID_INNOTECH: string };
type ScheduleRecord = { id: string; pageName: BrandName; pageId: string; caption: string; imageUrl?: string; withImage: boolean; scheduledAt: string; status: "scheduled"; createdAt: string };

export const seriesSchedulerRoutes = new Hono<{ Bindings: Env }>();
function brand(v: string): BrandName { const x = v.trim().toLowerCase(); if (x === "zawaago") return "Zawaago"; if (x === "innotech" || x === "inno tech") return "InnoTech"; throw new Error("Unsupported Facebook Page. Select Zawaago or InnoTech."); }
function cfg(page: BrandName, env: Env) { const inno = page === "InnoTech"; const pageId = (inno ? env.PAGE_ID_INNOTECH : env.PAGE_ID_ZAWAAGO)?.trim(); const token = (inno ? env.FB_TOKEN_INNOTECH : env.FB_TOKEN_ZAWAAGO)?.trim(); if (!pageId) throw new Error(`Page ID is not configured for ${page}.`); if (!token) throw new Error(`Facebook Page token is not configured for ${page}.`); return { pageId }; }
async function validateImage(env: Env, imageUrl: string, request: Request) {
  if (!env.ASSETS) throw new Error("Asset storage is not configured.");
  if (!/^https?:\/\//i.test(imageUrl)) throw new Error("Episode image URL must be a public HTTP(S) URL.");
  const url = new URL(imageUrl);
  const origin = new URL(request.url).origin;
  if (url.origin !== origin || !url.pathname.startsWith("/api/autoposter/assets/")) throw new Error("Episode image must be a generated R2 asset from this Autoposter.");
  let objectKey = "";
  try { objectKey = decodeURIComponent(url.pathname.slice("/api/autoposter/assets/".length)); } catch { throw new Error("Episode image URL is invalid."); }
  if (!objectKey.startsWith("generated/") || objectKey.includes("..")) throw new Error("Episode image must reference a generated R2 asset.");
  const object = await env.ASSETS.get(objectKey);
  if (!object) throw new Error("Episode image is no longer available in R2. Regenerate the episode visual.");
  const contentType = object.httpMetadata?.contentType || "";
  if (!contentType.toLowerCase().startsWith("image/")) throw new Error("Episode R2 asset is not an image.");
  if (object.size <= 1000) throw new Error("Episode image asset is unexpectedly small. Regenerate the visual.");
}
seriesSchedulerRoutes.post("/autoposter/schedules/series", async (c) => { try { const body = await c.req.json().catch(() => ({})); const pageName = brand(String(body.page || body.pageName || "Zawaago")); const posts = Array.isArray(body.posts) ? body.posts : []; const intervalHours = Number(body.intervalHours || 24); const startAt = String(body.startAt || "").trim(); if (posts.length < 1 || posts.length > 10) return c.json({ error: "Series must contain 1-10 posts." }, 400); if (!Number.isFinite(intervalHours) || intervalHours < 1 || intervalHours > 168) return c.json({ error: "Interval must be between 1 and 168 hours." }, 400); const start = new Date(startAt); if (!startAt || Number.isNaN(start.getTime()) || start.getTime() <= Date.now() + 30_000) return c.json({ error: "Series start time must be a valid future date/time." }, 400); const { pageId } = cfg(pageName, c.env); if (!c.env.ASSETS) return c.json({ error: "Asset storage is not configured." }, 503); const schedules: ScheduleRecord[] = []; for (let i = 0; i < posts.length; i += 1) { const post = posts[i] || {}; const caption = String(post.caption || "").trim(); const imageUrl = String(post.imageUrl || "").trim(); const withImage = Boolean(post.withImage); if (!caption) return c.json({ error: `Episode ${i + 1} has no caption.` }, 400); if (withImage) await validateImage(c.env, imageUrl, c.req.raw); const record: ScheduleRecord = { id: crypto.randomUUID(), pageName, pageId, caption, ...(imageUrl ? { imageUrl } : {}), withImage, scheduledAt: new Date(start.getTime() + i * intervalHours * 3600000).toISOString(), status: "scheduled", createdAt: new Date().toISOString() }; await c.env.ASSETS.put(`${PREFIX}${record.id}.json`, JSON.stringify(record), { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } }); schedules.push(record); } return c.json({ ok: true, schedules }, 201); } catch (error) { return c.json({ error: "Series scheduling failed", details: error instanceof Error ? error.message : String(error) }, 500); } });
