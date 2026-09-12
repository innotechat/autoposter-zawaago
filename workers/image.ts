import { Hono } from "hono";

type Env = {
  AI: Ai;
  ASSETS?: R2Bucket;
};

type Brief = {
  topic: string;
  pageName: string;
  contentType: string;
  tone: string;
  language?: string;
  audience?: string;
  visualStyle?: string;
  aspectRatio?: string;
  branding?: string;
  logoPosition?: string;
  cta?: string;
  customPrompt?: string;
};

export const imageRoutes = new Hono<{ Bindings: Env }>();

function normalizePage(page: string): "Zawaago" | "InnoTech" {
  const normalized = page.trim().toLowerCase();
  if (normalized === "zawaago") return "Zawaago";
  if (normalized === "innotech" || normalized === "inno tech") return "InnoTech";
  throw new Error("Unsupported Facebook Page. Select Zawaago or InnoTech.");
}

function brandProfile(pageName: string) {
  if (pageName.toLowerCase().includes("zawaago")) {
    return {
      name: "Zawaago",
      description: "AI Agents, AI Apps, business automation and innovation consulting",
      visual: "premium modern business technology, intelligent automation, sophisticated editorial design",
    };
  }
  return {
    name: "InnoTech",
    description: "technology education, practical AI and modern digital tools",
    visual: "clean technology education, modern editorial design, practical innovation",
  };
}

function buildImagePrompt(brief: Brief): string {
  const brand = brandProfile(brief.pageName);
  const language = brief.language || "English";
  const audience = brief.audience || "business owners and professionals";
  const style = brief.visualStyle || "Premium Editorial";
  const ratio = brief.aspectRatio || "Square 1:1";
  const branding = brief.branding || "Subtle watermark";
  const position = brief.logoPosition || "Bottom Right";
  const cta = brief.cta || "None";

  return [
    `Create a premium social media visual for ${brand.name}.`,
    `Core subject: ${brief.topic}.`,
    `Content direction: ${brief.contentType}.`,
    `Target audience: ${audience}.`,
    `Language context: ${language}.`,
    `Visual style: ${style}.`,
    `Brand character: ${brand.description}; ${brand.visual}.`,
    `Composition: ${ratio}; strong focal subject; balanced negative space; professional hierarchy; mobile-first readability.`,
    `Branding treatment: ${branding}; logo position ${position}. Do not invent or render fake logos, brand names, URLs or statistics inside the artwork.`,
    `CTA context: ${cta}.`,
    `Use realistic lighting, crisp details, clean geometry, premium commercial art direction, high visual quality.`,
    `Create a clean original artwork with no generator watermark, no platform watermark, no signature, no fake logo, no fake UI and no illegible text.`,
    `Avoid clutter, generic stock-photo look, distorted hands/faces, excessive text and visual noise.`,
    brief.customPrompt ? `Additional creative direction: ${brief.customPrompt}.` : "",
  ].filter(Boolean).join(" ");
}

function imageBytesFromResult(result: any): Uint8Array | null {
  if (result instanceof Uint8Array) return result;
  if (result instanceof ArrayBuffer) return new Uint8Array(result);
  if (typeof result?.image === "string") {
    const binary = atob(result.image);
    return Uint8Array.from(binary, (char) => char.codePointAt(0) || 0);
  }
  return null;
}

async function storeImage(env: Env, bytes: Uint8Array, request: Request, pageName: string) {
  if (!env.ASSETS) throw new Error("Cloudflare R2 image storage is not configured.");
  const safeBrand = pageName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const key = `generated/${safeBrand}/${Date.now()}-${crypto.randomUUID()}.jpg`;
  await env.ASSETS.put(key, bytes, {
    httpMetadata: {
      contentType: "image/jpeg",
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      brand: safeBrand,
      source: "cloudflare-flux",
      watermark: "none",
    },
  });
  return `${new URL(request.url).origin}/api/autoposter/assets/${encodeURIComponent(key)}`;
}

imageRoutes.post("/autoposter/generate-image", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const brief: Brief = {
      topic: String(body.topic || "AI Agents business").trim(),
      pageName: String(body.pageName || "Zawaago").trim(),
      contentType: String(body.contentType || "AI Agents & Automation").trim(),
      tone: String(body.tone || "Professional Hinglish").trim(),
      language: String(body.language || "English").trim(),
      audience: String(body.audience || "business owners and professionals").trim(),
      visualStyle: String(body.visualStyle || "Premium Editorial").trim(),
      aspectRatio: String(body.aspectRatio || "Square 1:1").trim(),
      branding: String(body.branding || "Subtle watermark").trim(),
      logoPosition: String(body.logoPosition || "Bottom Right").trim(),
      cta: String(body.cta || "None").trim(),
      customPrompt: String(body.imgPrompt || body.customPrompt || "").trim(),
    };

    normalizePage(brief.pageName);
    const prompt = buildImagePrompt(brief);
    let lastError = "";

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const result: any = await c.env.AI.run("@cf/black-forest-labs/flux-1-schnell" as any, {
          prompt,
          steps: 8,
          seed: Math.floor(Math.random() * 2147483647),
        });
        const bytes = imageBytesFromResult(result);
        if (!bytes || bytes.length <= 1000) {
          lastError = "Cloudflare Flux returned no usable image.";
          continue;
        }

        const imageUrl = await storeImage(c.env, bytes, c.req.raw, brief.pageName);
        return c.json({
          imageUrl,
          prompt,
          source: "cloudflare-flux-r2",
          quality: "production",
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.warn(`Cloudflare Flux image attempt ${attempt} failed`, error);
      }
    }

    return c.json({
      error: "Image generation failed",
      details: lastError || "Cloudflare Flux could not generate a usable image after 3 attempts.",
    }, 503);
  } catch (error) {
    return c.json({
      error: "Image generation failed",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
