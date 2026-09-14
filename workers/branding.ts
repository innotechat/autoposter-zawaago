import { Hono } from "hono";

type Env = {
  ASSETS?: R2Bucket;
};

export const brandingRoutes = new Hono<{ Bindings: Env }>();

function normalizeBrand(value: string): "zawaago" | "innotech" {
  const brand = value.trim().toLowerCase();
  if (brand === "zawaago") return "zawaago";
  if (brand === "innotech" || brand === "inno tech") return "innotech";
  throw new Error("Unsupported brand. Select Zawaago or InnoTech.");
}

function extensionFor(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

brandingRoutes.post("/autoposter/assets/brand", async (c) => {
  try {
    if (!c.env.ASSETS) return c.json({ error: "Image storage is not configured" }, 503);

    const contentTypeHeader = c.req.header("content-type") || "";
    if (!contentTypeHeader.toLowerCase().includes("multipart/form-data")) {
      return c.json({ error: "Branded image upload must use multipart/form-data" }, 415);
    }

    // Use the platform Request/FormData parser directly. This avoids relying on
    // Hono's parseBody coercion for browser-generated File objects.
    const form = await c.req.raw.formData();
    const fileValue = form.get("file");
    const brandValue = form.get("pageName");

    if (!(fileValue instanceof File) && !(fileValue instanceof Blob)) {
      return c.json({ error: "Branded image file is required" }, 400);
    }
    if (typeof brandValue !== "string") {
      return c.json({ error: "Brand name is required" }, 400);
    }

    const brand = normalizeBrand(brandValue);
    const uploadedFile = fileValue as Blob;
    const contentType = (uploadedFile.type || "").toLowerCase();

    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      return c.json({ error: "Only JPEG, PNG or WebP branded assets are accepted", details: `Received content type: ${contentType || "unknown"}` }, 400);
    }
    if (uploadedFile.size < 1000) {
      return c.json({ error: "Branded image is unexpectedly small", details: `Received ${uploadedFile.size} bytes` }, 400);
    }
    if (uploadedFile.size > 12 * 1024 * 1024) {
      return c.json({ error: "Branded image exceeds the 12 MB limit" }, 413);
    }

    const key = `generated/${brand}/branded/${Date.now()}-${crypto.randomUUID()}.${extensionFor(contentType)}`;
    await c.env.ASSETS.put(key, await uploadedFile.arrayBuffer(), {
      httpMetadata: {
        contentType,
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: {
        brand,
        source: "autoposter-brand-overlay",
      },
    });

    return c.json({
      imageUrl: `${new URL(c.req.url).origin}/api/autoposter/assets/${encodeURIComponent(key)}`,
      key,
      brand,
      source: "r2-branded",
    });
  } catch (error) {
    return c.json({
      error: "Brand asset upload failed",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
