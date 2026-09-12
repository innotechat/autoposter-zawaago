import { Hono } from "hono";

type Env = { ASSETS?: R2Bucket };
const GENERATED_PREFIX = "generated/";
const VALID_BRANDS = new Set(["Zawaago", "InnoTech"]);

export const galleryRoutes = new Hono<{ Bindings: Env }>();

function jsonError(c: any, status: number, message: string) { return c.json({ ok: false, error: message }, status); }
function normalizeBrand(raw?: string) {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!VALID_BRANDS.has(value)) throw new Error("Unsupported brand filter.");
  return value;
}
function safeAssetKey(raw: string): string {
  let key: string;
  try { key = decodeURIComponent(raw).replace(/^\/+/, ""); } catch { throw new Error("Invalid asset key."); }
  if (!key.startsWith(GENERATED_PREFIX) || key.includes("..") || key.includes("\\") || key.includes("//")) throw new Error("Invalid asset key.");
  if (!/^[a-zA-Z0-9_./-]+$/.test(key)) throw new Error("Invalid asset key.");
  return key;
}
function assetBrand(key: string): "Zawaago" | "InnoTech" | null {
  if (key.startsWith(`${GENERATED_PREFIX}zawaago/`)) return "Zawaago";
  if (key.startsWith(`${GENERATED_PREFIX}innotech/`)) return "InnoTech";
  return null;
}
function assetUrl(request: Request, key: string) { return `${new URL(request.url).origin}/api/gallery/asset/${encodeURIComponent(key)}`; }

galleryRoutes.get("/gallery/assets", async (c) => {
  if (!c.env.ASSETS) return jsonError(c, 503, "Asset storage is not configured.");
  let brand: string | undefined;
  try { brand = normalizeBrand(c.req.query("brand")); } catch (error) { return jsonError(c, 400, error instanceof Error ? error.message : "Invalid brand."); }
  const rawLimit = Number(c.req.query("limit") || "24");
  const limit = Number.isFinite(rawLimit) ? Math.min(60, Math.max(1, Math.floor(rawLimit))) : 24;
  const cursor = c.req.query("cursor") || undefined;
  const prefix = brand ? `${GENERATED_PREFIX}${brand.toLowerCase()}/` : GENERATED_PREFIX;
  const listed = await c.env.ASSETS.list({ prefix, cursor, limit });
  const assets = listed.objects.map((object) => {
    const resolvedBrand = assetBrand(object.key);
    if (!resolvedBrand) return null;
    return { key: object.key, brand: resolvedBrand, createdAt: object.uploaded.toISOString(), mimeType: object.httpMetadata?.contentType || "image/jpeg", size: object.size, etag: object.etag, url: assetUrl(c.req.raw, object.key), source: "generated" };
  }).filter(Boolean);
  return c.json({ ok: true, assets, cursor: listed.truncated ? listed.cursor : null });
});

galleryRoutes.get("/gallery/asset/*", async (c) => {
  if (!c.env.ASSETS) return c.text("Image storage is not configured", 503);
  let key: string;
  try { key = safeAssetKey(c.req.path.replace("/api/gallery/asset/", "")); } catch (error) { return jsonError(c, 400, error instanceof Error ? error.message : "Invalid asset key."); }
  if (!assetBrand(key)) return jsonError(c, 400, "Invalid asset namespace.");
  const object = await c.env.ASSETS.get(key);
  if (!object) return jsonError(c, 404, "Asset not found.");
  const headers = new Headers(); object.writeHttpMetadata(headers); headers.set("etag", object.httpEtag); headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
});

galleryRoutes.delete("/gallery/assets/*", async (c) => {
  if (!c.env.ASSETS) return jsonError(c, 503, "Asset storage is not configured.");
  let key: string;
  try { key = safeAssetKey(c.req.path.replace("/api/gallery/assets/", "")); } catch (error) { return jsonError(c, 400, error instanceof Error ? error.message : "Invalid asset key."); }
  if (!assetBrand(key)) return jsonError(c, 400, "Invalid asset namespace.");
  if (!(await c.env.ASSETS.head(key))) return jsonError(c, 404, "Asset not found.");
  await c.env.ASSETS.delete(key);
  return c.json({ ok: true, key });
});
