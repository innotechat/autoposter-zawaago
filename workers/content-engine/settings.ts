import type { D1DatabaseLike, R2BucketLike } from "./content-memory";

export interface ContentEngineSettings {
  automationEnabled: boolean;
  autoPlanRollingDays: number;
  preGenerateMinutes: number;
  publicOrigin?: string;
  lastCronRunAt?: string;
  lastCronSummary?: string;
  lastCronError?: string;
  updatedAt: string;
}

const SETTINGS_R2_KEY = "_system/content-engine-settings.json";
const IST_OFFSET_MS = 330 * 60 * 1000;

let cachedSettings: ContentEngineSettings | null = null;
let lastCapturedOrigin: string | null = null;

export function getIstDateString(date = new Date()): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map((n) => Number(n));
  const utcMs = Date.UTC(y, (m || 1) - 1, d || 1) + days * 24 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString().slice(0, 10);
}

export function isLocalOrPlaceholderOrigin(origin?: string | null): boolean {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "studio.local" ||
      host === "assets.local" ||
      host.endsWith(".local")
    );
  } catch {
    return true;
  }
}

export function isPublicOrigin(origin?: string | null): origin is string {
  if (!origin) return false;
  if (!/^https?:\/\//i.test(origin)) return false;
  return !isLocalOrPlaceholderOrigin(origin);
}

export function defaultSettings(): ContentEngineSettings {
  return {
    automationEnabled: false,
    autoPlanRollingDays: 10,
    preGenerateMinutes: 30,
    updatedAt: new Date().toISOString()
  };
}

export async function loadEngineSettings(
  env: { DB?: D1DatabaseLike; ASSETS?: R2BucketLike; PUBLIC_ORIGIN?: string }
): Promise<ContentEngineSettings> {
  const base = defaultSettings();

  if (env.DB) {
    try {
      const row = await env.DB.prepare("SELECT settings_json FROM content_settings WHERE id = 'default'").first<{
        settings_json?: string;
      }>();
      if (row?.settings_json) {
        const parsed = JSON.parse(row.settings_json);
        const merged: ContentEngineSettings = {
          ...base,
          ...parsed,
          automationEnabled: Boolean(parsed.automationEnabled),
          autoPlanRollingDays: Math.min(30, Math.max(1, Number(parsed.autoPlanRollingDays || 10))),
          preGenerateMinutes: Math.min(180, Math.max(5, Number(parsed.preGenerateMinutes || 30)))
        };
        if (env.PUBLIC_ORIGIN && isPublicOrigin(env.PUBLIC_ORIGIN)) {
          merged.publicOrigin = env.PUBLIC_ORIGIN.replace(/\/+$/, "");
        }
        cachedSettings = merged;
        return merged;
      }
    } catch {
      // Fall back to R2/in-memory if table not initialized yet
    }
  }

  if (env.ASSETS) {
    try {
      const obj = await env.ASSETS.get(SETTINGS_R2_KEY);
      if (obj) {
        const parsed = await obj.json();
        const merged: ContentEngineSettings = {
          ...base,
          ...parsed,
          automationEnabled: Boolean(parsed.automationEnabled),
          autoPlanRollingDays: Math.min(30, Math.max(1, Number(parsed.autoPlanRollingDays || 10))),
          preGenerateMinutes: Math.min(180, Math.max(5, Number(parsed.preGenerateMinutes || 30)))
        };
        if (env.PUBLIC_ORIGIN && isPublicOrigin(env.PUBLIC_ORIGIN)) {
          merged.publicOrigin = env.PUBLIC_ORIGIN.replace(/\/+$/, "");
        }
        cachedSettings = merged;
        return merged;
      }
    } catch {
      // Ignore parse/read error
    }
  }

  if (cachedSettings) {
    if (env.PUBLIC_ORIGIN && isPublicOrigin(env.PUBLIC_ORIGIN)) {
      return { ...cachedSettings, publicOrigin: env.PUBLIC_ORIGIN.replace(/\/+$/, "") };
    }
    return cachedSettings;
  }

  if (env.PUBLIC_ORIGIN && isPublicOrigin(env.PUBLIC_ORIGIN)) {
    base.publicOrigin = env.PUBLIC_ORIGIN.replace(/\/+$/, "");
  }
  return base;
}

export async function saveEngineSettings(
  env: { DB?: D1DatabaseLike; ASSETS?: R2BucketLike; PUBLIC_ORIGIN?: string },
  updates: Partial<ContentEngineSettings>
): Promise<ContentEngineSettings> {
  const current = await loadEngineSettings(env);
  const next: ContentEngineSettings = {
    ...current,
    ...updates,
    automationEnabled:
      typeof updates.automationEnabled === "boolean" ? updates.automationEnabled : current.automationEnabled,
    autoPlanRollingDays: Math.min(
      30,
      Math.max(1, Number(updates.autoPlanRollingDays ?? current.autoPlanRollingDays ?? 10))
    ),
    preGenerateMinutes: Math.min(
      180,
      Math.max(5, Number(updates.preGenerateMinutes ?? current.preGenerateMinutes ?? 30))
    ),
    updatedAt: new Date().toISOString()
  };

  cachedSettings = next;

  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO content_settings (id, settings_json, updated_at)
         VALUES ('default', ?, ?)
         ON CONFLICT(id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at`
      )
        .bind(JSON.stringify(next), next.updatedAt)
        .run();
    } catch (err) {
      console.warn("D1 saveEngineSettings warning:", err);
    }
  }

  if (env.ASSETS) {
    try {
      await env.ASSETS.put(SETTINGS_R2_KEY, JSON.stringify(next), {
        httpMetadata: { contentType: "application/json", cacheControl: "no-store" }
      });
    } catch (err) {
      console.warn("R2 saveEngineSettings warning:", err);
    }
  }

  return next;
}

export async function capturePublicOrigin(
  env: { DB?: D1DatabaseLike; ASSETS?: R2BucketLike; PUBLIC_ORIGIN?: string },
  requestUrl: string
): Promise<void> {
  let origin = "";
  try {
    origin = new URL(requestUrl).origin.replace(/\/+$/, "");
  } catch {
    return;
  }
  if (!isPublicOrigin(origin)) return;
  if (lastCapturedOrigin === origin) return;
  lastCapturedOrigin = origin;

  try {
    const current = await loadEngineSettings(env);
    if (current.publicOrigin !== origin) {
      await saveEngineSettings(env, { publicOrigin: origin });
    }
  } catch (err) {
    console.warn("capturePublicOrigin warning:", err);
  }
}

export async function resolvePublicOrigin(
  env: { DB?: D1DatabaseLike; ASSETS?: R2BucketLike; PUBLIC_ORIGIN?: string },
  requestOrigin?: string
): Promise<string | undefined> {
  if (env.PUBLIC_ORIGIN && isPublicOrigin(env.PUBLIC_ORIGIN)) {
    return env.PUBLIC_ORIGIN.replace(/\/+$/, "");
  }
  if (requestOrigin && isPublicOrigin(requestOrigin)) {
    return requestOrigin.replace(/\/+$/, "");
  }
  const settings = await loadEngineSettings(env);
  if (settings.publicOrigin && isPublicOrigin(settings.publicOrigin)) {
    return settings.publicOrigin.replace(/\/+$/, "");
  }
  return requestOrigin ? requestOrigin.replace(/\/+$/, "") : undefined;
}
