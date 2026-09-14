import type { Context, Next } from "hono";

type GuardState = { active: number; lastStartedAt: number };

const states = new Map<string, GuardState>();
const MAX_TRACKED_KEYS = 512;

function clientKey(c: Context, route: string) {
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
  return `${route}:${ip}`;
}

function touch(key: string) {
  if (states.size >= MAX_TRACKED_KEYS && !states.has(key)) {
    const first = states.keys().next().value as string | undefined;
    if (first) states.delete(first);
  }
  const state = states.get(key) || { active: 0, lastStartedAt: 0 };
  states.set(key, state);
  return state;
}

export async function reelRequestGuard(c: Context, next: Next) {
  const path = c.req.path;
  const isStoryboard = path === "/api/reel-lab/storyboard";
  const isTts = path === "/api/reel-lab/tts";
  const isImage = path === "/api/autoposter/generate-image";
  if (!isStoryboard && !isTts && !isImage) return next();

  const route = isStoryboard ? "storyboard" : isTts ? "tts" : "image";
  const state = touch(clientKey(c, route));
  const now = Date.now();
  const minGapMs = isStoryboard ? 1500 : isTts ? 1000 : 750;
  if (state.active > 0 || now - state.lastStartedAt < minGapMs) {
    const retryAfter = Math.max(1, Math.ceil((minGapMs - Math.max(0, now - state.lastStartedAt)) / 1000));
    c.header("Retry-After", String(retryAfter));
    return c.json({ ok: false, error: "request_throttled", details: "AI request already in progress or too close to the previous request. Please wait briefly and retry." }, 429);
  }

  state.active += 1;
  state.lastStartedAt = now;
  try {
    return await next();
  } finally {
    state.active = Math.max(0, state.active - 1);
  }
}

export async function publicAssetGuard(c: Context, next: Next) {
  const prefix = "/api/autoposter/assets/";

  // POST /brand is the Studio's browser-side branding upload. Keep normal
  // generated-asset reads protected by the path safety checks below, while
  // allowing this internal upload route to reach brandingRoutes.
  if (c.req.path === `${prefix}brand` && c.req.method === "POST") return next();

  if (!c.req.path.startsWith(prefix)) return next();
  let key = "";
  try {
    key = decodeURIComponent(c.req.path.slice(prefix.length));
  } catch {
    return c.text("Invalid asset path", 400);
  }
  const safe = key.startsWith("generated/") && !key.includes("..") && !key.includes("\\") && !key.startsWith("/");
  if (!safe) return c.text("Asset not found", 404);
  return next();
}
