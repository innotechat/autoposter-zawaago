import { Hono } from "hono";

type Env = {
  FB_TOKEN_ZAWAAGO?: string;
  FB_TOKEN_INNOTECH?: string;
  PAGE_ID_ZAWAAGO: string;
  PAGE_ID_INNOTECH: string;
  ASSETS?: R2Bucket;
};

type BrandName = "Zawaago" | "InnoTech";
const GRAPH_VERSION = "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const reelRoutes = new Hono<{ Bindings: Env }>();

function normalizeBrand(value: string): BrandName {
  const normalized = value.trim().toLowerCase();
  if (normalized === "zawaago") return "Zawaago";
  if (normalized === "innotech" || normalized === "inno tech") return "InnoTech";
  throw new Error("Unsupported Facebook Page. Select Zawaago or InnoTech.");
}

function pageConfig(pageName: BrandName, env: Env) {
  const inno = pageName === "InnoTech";
  const pageId = (inno ? env.PAGE_ID_INNOTECH : env.PAGE_ID_ZAWAAGO)?.trim() || "";
  const token = (inno ? env.FB_TOKEN_INNOTECH : env.FB_TOKEN_ZAWAAGO)?.trim() || "";
  if (!pageId) throw new Error(`Page ID is not configured for ${pageName}.`);
  if (!token) throw new Error(`Facebook Page token is not configured for ${pageName}.`);
  return { pageId, token };
}

function graphError(data: any, fallback: string) {
  const code = data?.error?.code;
  if (code === 190) return "Facebook Page token is invalid or expired.";
  if (code === 200) return "Facebook rejected the Page token or its permissions.";
  return data?.error?.message || fallback;
}

async function verifyR2Video(env: Env, videoUrl: string, request?: Request) {
  if (!env.ASSETS) throw new Error("Asset storage is not configured.");
  const url = new URL(videoUrl);
  if (request) {
    const origin = new URL(request.url).origin;
    const prefix = "/api/autoposter/assets/";
    if (url.origin !== origin || !url.pathname.startsWith(prefix)) throw new Error("Reel must be a video stored in this Autoposter R2 bucket.");
  }
  const prefix = "/api/autoposter/assets/";
  if (!url.pathname.startsWith(prefix)) throw new Error("Invalid Reel asset URL.");
  const objectKey = decodeURIComponent(url.pathname.slice(prefix.length));
  if (!objectKey.startsWith("generated/") || objectKey.includes("..")) throw new Error("Invalid Reel asset path.");
  const object = await env.ASSETS.get(objectKey);
  if (!object) throw new Error("Reel video asset is no longer available in R2.");
  const contentType = (object.httpMetadata?.contentType || "").toLowerCase();
  if (contentType !== "video/mp4") throw new Error("Facebook Reel publishing requires an MP4 asset. Render an MP4 Reel before publishing.");
  if (object.size < 1000) throw new Error("Reel video asset is unexpectedly small.");
  return { objectKey, size: object.size };
}

async function graphJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(graphError(data, `Facebook returned HTTP ${response.status}.`));
  return data;
}

export async function publishFacebookReel(env: Env, pageName: BrandName, videoUrl: string, caption: string, title = "") {
  const { pageId, token } = pageConfig(pageName, env);
  const start = await graphJson(`${GRAPH_BASE}/${encodeURIComponent(pageId)}/video_reels`, {
    method: "POST",
    body: new URLSearchParams({ upload_phase: "start", access_token: token }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  const videoId = String(start?.video_id || "");
  const uploadUrl = String(start?.upload_url || "");
  if (!videoId || !uploadUrl) throw new Error("Facebook did not return a Reel upload session.");

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, file_url: videoUrl },
  });
  const uploadData: any = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok || uploadData?.error || uploadData?.success === false) throw new Error(graphError(uploadData, `Facebook Reel upload failed (${uploadResponse.status}).`));

  const finishParams: Record<string, string> = {
    video_id: videoId,
    upload_phase: "finish",
    video_state: "PUBLISHED",
    description: caption,
    access_token: token,
  };
  if (title) finishParams.title = title.slice(0, 100);
  const finish = await graphJson(`${GRAPH_BASE}/${encodeURIComponent(pageId)}/video_reels`, {
    method: "POST",
    body: new URLSearchParams(finishParams),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  return { pageName, pageId, videoId, published: finish?.success !== false, graphVersion: GRAPH_VERSION };
}

reelRoutes.post("/autoposter/reels/publish", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const pageName = normalizeBrand(String(body.page || body.pageName || "Zawaago"));
    const caption = String(body.caption || body.description || "").trim();
    const title = String(body.title || "").trim().slice(0, 100);
    const videoUrl = String(body.videoUrl || "").trim();
    if (!caption) return c.json({ error: "Reel caption is required." }, 400);
    if (!videoUrl) return c.json({ error: "Reel video URL is required." }, 400);
    await verifyR2Video(c.env, videoUrl, c.req.raw);
    const result = await publishFacebookReel(c.env, pageName, videoUrl, caption, title);
    return c.json({ ok: true, ...result });
  } catch (error) {
    return c.json({ error: "Facebook Reel publishing failed", details: error instanceof Error ? error.message : String(error) }, 502);
  }
});
