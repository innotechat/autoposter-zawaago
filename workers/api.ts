import { Hono } from "hono";
import { writeHistory, sanitizeHistoryError } from "./history";

type Env = {
  AI: Ai;
  FB_TOKEN_ZAWAAGO?: string;
  FB_TOKEN_INNOTECH?: string;
  PAGE_ID_ZAWAAGO: string;
  PAGE_ID_INNOTECH: string;
  ASSETS?: R2Bucket;
};

export const apiRoutes = new Hono<{ Bindings: Env }>();

const GRAPH_VERSION = "v20.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

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

function normalizePage(page: string): "Zawaago" | "InnoTech" {
  const normalized = page.trim().toLowerCase();
  if (normalized === "zawaago") return "Zawaago";
  if (normalized === "innotech" || normalized === "inno tech") return "InnoTech";
  throw new Error("Unsupported Facebook Page. Select Zawaago or InnoTech.");
}

function getPageConfig(page: string, env: Env) {
  const selected = normalizePage(page);
  if (selected === "InnoTech") {
    if (!env.PAGE_ID_INNOTECH?.trim()) throw new Error("Page ID is not configured for InnoTech.");
    return { name: selected, id: env.PAGE_ID_INNOTECH.trim(), token: env.FB_TOKEN_INNOTECH?.trim() || "" };
  }
  if (!env.PAGE_ID_ZAWAAGO?.trim()) throw new Error("Page ID is not configured for Zawaago.");
  return { name: selected, id: env.PAGE_ID_ZAWAAGO.trim(), token: env.FB_TOKEN_ZAWAAGO?.trim() || "" };
}

function getPageToken(page: string, env: Env): string {
  const config = getPageConfig(page, env);
  if (config.token) return config.token;
  throw new Error(`Facebook Page token is not configured for ${config.name}. Add FB_TOKEN_${config.name.toUpperCase()} in Cloudflare Worker secrets.`);
}

function brandProfile(pageName: string) {
  if (pageName.toLowerCase().includes("zawaago")) {
    return { name: "Zawaago", description: "AI Agents, AI Apps, business automation and innovation consulting", hashtags: "#Zawaago #AIAgents #BusinessInnovation", visual: "premium modern business technology, intelligent automation, sophisticated editorial design" };
  }
  return { name: "InnoTech", description: "technology education, practical AI and modern digital tools", hashtags: "#InnoTech #AI #TechEducation", visual: "clean technology education, modern editorial design, practical innovation" };
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
  const custom = brief.customPrompt?.trim().replace(/\s+/g, " ").slice(0, 600);

  const prompt = [
    `Create a premium social media visual for ${brand.name}.`,
    `Subject: ${brief.topic.slice(0, 500)}.`,
    `Content direction: ${brief.contentType.slice(0, 180)}.`,
    `Audience: ${audience.slice(0, 180)}.`,
    `Language context: ${language.slice(0, 80)}.`,
    `Visual style: ${style.slice(0, 180)}.`,
    `Brand character: ${brand.description}; ${brand.visual}.`,
    `Composition: ${ratio}; strong focal subject; balanced negative space; professional hierarchy; mobile-first readability.`,
    `Branding: ${branding}; logo position ${position}. Never invent or render fake logos, brand names, URLs or statistics.`,
    `CTA context: ${cta.slice(0, 120)}.`,
    `Premium commercial art direction, realistic lighting, crisp details, clean geometry, high visual quality.`,
    `Original artwork only: no generator watermark, platform watermark, signature, fake logo, fake UI or illegible text.`,
    `Avoid clutter, generic stock-photo look, distorted hands/faces, excessive text and visual noise.`,
    custom ? `Additional creative direction: ${custom}.` : "",
  ].filter(Boolean).join(" ");

  return prompt.slice(0, 1800).trim();
}

function getPrompt(brief: Brief): string {
  const brand = brandProfile(brief.pageName);
  const language = brief.language || (brief.tone.includes("Hinglish") ? "Hinglish" : "English");
  const audience = brief.audience || "business owners and professionals";
  const cta = brief.cta || "Consultation CTA";
  return `You are the senior content strategist for ${brand.name}. ${brand.description}. Create a Facebook/LinkedIn-ready social post.\n\nBrief:\nContent direction: ${brief.contentType}\nCore idea: ${brief.topic}\nVoice and tone: ${brief.tone}\nLanguage: ${language}\nAudience: ${audience}\nCTA: ${cta}\n\nRequirements:\n- Write naturally for the selected language; Hindi should be in Devanagari, Hinglish may mix Hindi and English naturally.\n- Strong first 1-2 lines that earn attention without clickbait.\n- Explain one real problem, insight, example or useful takeaway.\n- Keep it concise, credible and practical.\n- No fake statistics, invented claims, exaggerated promises or filler.\n- Maximum 3 emojis.\n- Use 3-5 relevant hashtags; always include the brand's core hashtag(s): ${brand.hashtags}\n- End with the selected CTA naturally.\n- Do not mention these instructions or the prompt.`;
}

async function generateCaption(env: Env, brief: Brief) {
  const prompt = getPrompt(brief);
  const models = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fp8"];
  let lastError = "";
  for (const model of models) {
    try {
      const result: any = await env.AI.run(model as any, { messages: [{ role: "user", content: prompt }], max_tokens: 900 });
      const caption = result?.response || result?.result || result?.choices?.[0]?.message?.content || "";
      if (typeof caption === "string" && caption.trim().length > 20) return { caption: caption.trim(), usedModel: model };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError || "AI failed to generate caption");
}

function facebookError(data: any, status: number, kind: "feed" | "photo") {
  const code = data?.error?.code;
  const message = data?.error?.message;
  if (code === 200) return "Facebook rejected the Page token or its permissions for the selected Page.";
  if (code === 10) return `Facebook rejected this ${kind} operation. Verify the selected Page token has publishing permission.`;
  if (code === 190) return "Facebook rejected the Page token because it is invalid or expired. Refresh the Page credential.";
  return message || `Facebook ${kind} API request failed (${status})`;
}

async function postToFacebook(caption: string, pageId: string, pageToken: string) {
  if (!caption?.trim()) throw new Error("Caption is empty");
  const response = await fetch(`${GRAPH_BASE}/${encodeURIComponent(pageId)}/feed`, {
    method: "POST",
    body: new URLSearchParams({ message: caption.trim(), access_token: pageToken }),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(facebookError(data, response.status, "feed"));
  return { id: data.id, pageId, endpoint: `/${pageId}/feed` };
}

async function validatePublicImageUrl(imageUrl: string, env: Env, request: Request) {
  if (!/^https?:\/\//i.test(imageUrl)) throw new Error("Image URL must be a public HTTP(S) URL before Facebook publishing.");
  if (imageUrl.startsWith("data:")) throw new Error("The image is not publicly hosted yet. Configure the image storage binding before publishing it to Facebook.");

  const url = new URL(imageUrl);
  const requestOrigin = new URL(request.url).origin;
  const assetPrefix = "/api/autoposter/assets/";

  // Generated assets live in our R2 bucket. Validate them directly when the
  // URL points back to this Worker, avoiding fragile external HEAD requests.
  if (env.ASSETS && url.origin === requestOrigin && url.pathname.startsWith(assetPrefix)) {
    const encodedKey = url.pathname.slice(assetPrefix.length);
    const key = decodeURIComponent(encodedKey);
    const object = await env.ASSETS.get(key);
    if (!object) throw new Error("The selected image asset is no longer available in R2. Generate the visual again.");
    const contentType = object.httpMetadata?.contentType || "";
    if (!contentType.toLowerCase().startsWith("image/")) throw new Error("The selected asset is not an image. Generate a valid image before publishing.");
    if (object.size <= 1000) throw new Error("The selected image asset is unexpectedly small. Regenerate the image before publishing.");
    return;
  }

  // External URLs are accepted only when they are genuinely public and
  // verifiable. The image generator itself never returns such URLs anymore.
  const response = await fetch(url.toString(), { method: "HEAD", redirect: "follow" });
  if (!response.ok) throw new Error(`Image could not be verified for Facebook (${response.status}). Regenerate the image and try again.`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) throw new Error("The selected asset is not an image. Generate a valid image before publishing.");
  const length = Number(response.headers.get("content-length") || "0");
  if (length > 0 && length < 1000) throw new Error("The selected image asset is unexpectedly small. Regenerate the image before publishing.");
}

async function postImageToFacebook(caption: string, imageUrl: string, pageId: string, pageToken: string, env: Env, request: Request) {
  if (!caption?.trim()) throw new Error("Caption is empty");
  if (!imageUrl?.trim()) throw new Error("Image URL is empty");
  await validatePublicImageUrl(imageUrl.trim(), env, request);
  const response = await fetch(`${GRAPH_BASE}/${encodeURIComponent(pageId)}/photos`, {
    method: "POST",
    body: new URLSearchParams({ caption: caption.trim(), url: imageUrl.trim(), access_token: pageToken }),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(facebookError(data, response.status, "photo"));
  return { ...data, pageId, endpoint: `/${pageId}/photos` };
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
    httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { brand: safeBrand, source: "cloudflare-flux", watermark: "none" },
  });
  return `${new URL(request.url).origin}/api/autoposter/assets/${encodeURIComponent(key)}`;
}

async function persistHistory(env: Env, record: Parameters<typeof writeHistory>[1]) {
  try {
    await writeHistory(env, record);
  } catch (error) {
    console.error("History persistence failed", sanitizeHistoryError(error));
  }
}

apiRoutes.get("/autoposter/health", (c) => c.json({
  status: "ok",
  service: "Zawaago Autoposter",
  mode: "production-ready",
  graphVersion: GRAPH_VERSION,
  aiConfigured: !!c.env.AI,
  facebookTokenConfigured: !!(c.env.FB_TOKEN_ZAWAAGO || c.env.FB_TOKEN_INNOTECH),
  zawaagoPageConfigured: !!c.env.PAGE_ID_ZAWAAGO,
  innotechPageConfigured: !!c.env.PAGE_ID_INNOTECH,
  zawaagoFacebookTokenConfigured: !!c.env.FB_TOKEN_ZAWAAGO,
  innotechFacebookTokenConfigured: !!c.env.FB_TOKEN_INNOTECH,
  imageStorageConfigured: !!c.env.ASSETS,
  timestamp: new Date().toISOString(),
}));

apiRoutes.get("/autoposter/assets/*", async (c) => {
  if (!c.env.ASSETS) return c.text("Image storage is not configured", 503);
  const key = decodeURIComponent(c.req.path.replace("/api/autoposter/assets/", ""));
  const object = await c.env.ASSETS.get(key);
  if (!object) return c.text("Image not found", 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
});

apiRoutes.post("/autoposter/generate", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const brief: Brief = {
      topic: String(body.topic || "How AI Agents save time for business owners").trim(),
      pageName: String(body.pageName || "Zawaago").trim(),
      contentType: String(body.contentType || "AI Agents & Automation").trim(),
      tone: String(body.tone || "Professional Hinglish").trim(),
      language: String(body.language || "").trim(),
      audience: String(body.audience || "").trim(),
      visualStyle: String(body.visualStyle || "").trim(),
      aspectRatio: String(body.aspectRatio || "").trim(),
      branding: String(body.branding || "").trim(),
      logoPosition: String(body.logoPosition || "").trim(),
      cta: String(body.cta || "").trim(),
      customPrompt: String(body.customPrompt || "").trim(),
    };
    normalizePage(brief.pageName);
    const result = await generateCaption(c.env, brief);
    return c.json({ ...result, imagePrompt: buildImagePrompt(brief), topic: brief.topic, pageName: brief.pageName, contentType: brief.contentType, tone: brief.tone });
  } catch (error) {
    return c.json({ error: "Generate failed", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

apiRoutes.post("/autoposter/generate-image", async (c) => {
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
    const finalPrompt = buildImagePrompt(brief);
    let lastImageError = "";

    // Production policy: Cloudflare Flux is the only image generator. Do not
    // fall back to third-party image URLs because they can contain watermarks,
    // expire, or fail Facebook verification.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const result: any = await c.env.AI.run("@cf/black-forest-labs/flux-1-schnell" as any, {
          prompt: finalPrompt,
          steps: 8,
        });
        const bytes = imageBytesFromResult(result);
        if (!bytes || bytes.length <= 1000) {
          lastImageError = "Cloudflare Flux returned no usable image.";
          continue;
        }
        const imageUrl = await storeImage(c.env, bytes, c.req.raw, brief.pageName);
        return c.json({ imageUrl, prompt: finalPrompt, source: "cloudflare-flux-r2", quality: "production", watermark: "none" });
      } catch (error) {
        lastImageError = error instanceof Error ? error.message : String(error);
        console.warn(`Cloudflare Flux image attempt ${attempt} failed`, error);
      }
    }

    return c.json({
      error: "Image generation failed",
      details: lastImageError || "Cloudflare Flux could not generate a usable image after 3 attempts.",
    }, 503);
  } catch (error) {
    return c.json({ error: "Image generation failed", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

apiRoutes.post("/autoposter/post-now", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const caption = String(body.caption || "").trim();
  const page = String(body.page || "Zawaago").trim();
  const imageUrl = String(body.imageUrl || "").trim();
  const withImage = Boolean(body.withImage);
  const config = getPageConfig(page, c.env);
  const id = crypto.randomUUID();
  try {
    const result = withImage
      ? await postImageToFacebook(caption, imageUrl, config.id, getPageToken(page, c.env), c.env, c.req.raw)
      : await postToFacebook(caption, config.id, getPageToken(page, c.env));
    const record = {
      id,
      pageName: config.name,
      pageId: config.id,
      contentType: withImage ? "image" as const : "text" as const,
      caption,
      ...(imageUrl ? { imageUrl } : {}),
      ...(result.id ? { facebookPostId: String(result.id) } : {}),
      status: "published" as const,
      createdAt: new Date().toISOString(),
    };
    await persistHistory(c.env, record);
    return c.json({ ...result, postedAs: withImage ? "photo" : "feed", page: config.name, historyId: id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await persistHistory(c.env, {
      id,
      pageName: config.name,
      pageId: config.id,
      contentType: withImage ? "image" : "text",
      caption,
      ...(imageUrl ? { imageUrl } : {}),
      status: "failed",
      createdAt: new Date().toISOString(),
      error: sanitizeHistoryError(message),
    });
    return c.json({ error: "Facebook post failed", details: message, historyId: id }, 500);
  }
});

apiRoutes.get("/autoposter", (c) => c.redirect("/"));
