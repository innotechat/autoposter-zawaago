import { Hono } from "hono";

type Env = { ASSETS?: R2Bucket };

const HISTORY_PREFIX = "history/";
const VALID_BRANDS = new Set(["Zawaago", "InnoTech"]);
const VALID_STATUSES = new Set(["published", "failed"]);

type HistoryRecord = {
  id: string;
  pageName: "Zawaago" | "InnoTech";
  pageId: string;
  contentType: "text" | "image" | "reel";
  caption: string;
  imageUrl?: string;
  imageKey?: string;
  facebookPostId?: string;
  status: "published" | "failed";
  createdAt: string;
  error?: string;
};

export const historyRoutes = new Hono<{ Bindings: Env }>();

function jsonError(c: any, status: number, message: string) {
  return c.json({ ok: false, error: message }, status);
}

function normalizeBrand(raw?: string): "Zawaago" | "InnoTech" | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!VALID_BRANDS.has(value)) throw new Error("Unsupported brand filter.");
  return value as "Zawaago" | "InnoTech";
}

function safeHistoryId(raw: string): string {
  let id: string;
  try { id = decodeURIComponent(raw); } catch { throw new Error("Invalid history id."); }
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid history id.");
  return id;
}

function historyKey(record: Pick<HistoryRecord, "pageName" | "id">) {
  return `${HISTORY_PREFIX}${record.pageName.toLowerCase()}/${record.id}.json`;
}

function brandFromKey(key: string): "Zawaago" | "InnoTech" | null {
  if (key.startsWith(`${HISTORY_PREFIX}zawaago/`)) return "Zawaago";
  if (key.startsWith(`${HISTORY_PREFIX}innotech/`)) return "InnoTech";
  return null;
}

export function sanitizeHistoryError(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value || "Unknown error");
  return text.replace(/access[_ -]?token[^\s,;]*/gi, "access token [redacted]").slice(0, 500);
}

export async function writeHistory(env: Env, record: HistoryRecord) {
  if (!env.ASSETS) return false;
  const body = JSON.stringify(record);
  await env.ASSETS.put(historyKey(record), body, {
    httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
  });
  return true;
}

historyRoutes.get("/history", async (c) => {
  if (!c.env.ASSETS) return jsonError(c, 503, "Asset storage is not configured.");
  let brand: "Zawaago" | "InnoTech" | undefined;
  try { brand = normalizeBrand(c.req.query("brand")); } catch (error) { return jsonError(c, 400, error instanceof Error ? error.message : "Invalid brand."); }
  const rawLimit = Number(c.req.query("limit") || "30");
  const limit = Number.isFinite(rawLimit) ? Math.min(60, Math.max(1, Math.floor(rawLimit))) : 30;
  const cursor = c.req.query("cursor") || undefined;
  const prefix = brand ? `${HISTORY_PREFIX}${brand.toLowerCase()}/` : HISTORY_PREFIX;
  const listed = await c.env.ASSETS.list({ prefix, cursor, limit });
  const records: HistoryRecord[] = [];
  for (const object of listed.objects) {
    if (!brandFromKey(object.key)) continue;
    const stored = await c.env.ASSETS.get(object.key);
    if (!stored) continue;
    try {
      const record = await stored.json<HistoryRecord>();
      if (record && VALID_BRANDS.has(record.pageName) && VALID_STATUSES.has(record.status)) records.push(record);
    } catch {
      // Ignore malformed history objects rather than breaking the whole history page.
    }
  }
  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return c.json({ ok: true, records, cursor: listed.truncated ? listed.cursor : null });
});

historyRoutes.delete("/history/:id", async (c) => {
  if (!c.env.ASSETS) return jsonError(c, 503, "Asset storage is not configured.");
  let id: string;
  try { id = safeHistoryId(c.req.param("id")); } catch (error) { return jsonError(c, 400, error instanceof Error ? error.message : "Invalid history id."); }
  const brand = c.req.query("brand");
  if (!brand || !VALID_BRANDS.has(brand)) return jsonError(c, 400, "A valid brand is required to delete history.");
  const key = `${HISTORY_PREFIX}${brand.toLowerCase()}/${id}.json`;
  if (!(await c.env.ASSETS.head(key))) return jsonError(c, 404, "History record not found.");
  await c.env.ASSETS.delete(key);
  return c.json({ ok: true, id });
});
