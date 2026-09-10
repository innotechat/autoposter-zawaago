import { Hono } from "hono";

type Env = {
  AI: Ai;
  FB_TOKEN?: string;
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

function getPageId(page: string, env: Env): string {
  return page.toLowerCase() === "innotech" ? env.PAGE_ID_INNOTECH : env.PAGE_ID_ZAWAAGO;
}

function getPageToken(page: string, env: Env): string {
  const isInnoTech = page.toLowerCase() === "innotech";
  const token = isInnoTech ? env.FB_TOKEN_INNOTECH : env.FB_TOKEN_ZAWAAGO;
  if (token?.trim()) return token.trim();

  // Backward compatibility for the original single-token setup.
  if (env.FB_TOKEN?.trim()) return env.FB_TOKEN.trim();

  throw new Error(`Facebook Page token is not configured for ${isInnoTech ? "InnoTech" : "Zawaago"}. Add FB_TOKEN_${isInnoTech ? "INNOTECH" : "ZAWAAGO"} in Cloudflare Worker secrets.`);
}

function brandProfile(pageName: string) {
  if (pageName.toLowerCase().includes("zawaago")) {
    return {
      name: "Zawaago",
      description: "AI Agents, AI Apps, business automation and innovation consulting",
      hashtags: "#Zawaago #AIAgents #BusinessInnovation",
      visual: "premium modern business technology, intelligent automation, sophisticated editorial design",
    };
  }
  return {
    name: "InnoTech",
    description: "technology education, practical AI and modern digital tools",
    hashtags: "#InnoTech #AI #TechEducation",
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
    `Avoid clutter, generic stock-photo look, distorted hands/faces, excessive text, watermarks, fake UI, illegible typography and visual noise.`,
    brief.customPrompt ? `Additional creative direction: ${brief.customPrompt}.` : "",
  ].filter(Boolean).join(" ");
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
  const models = [
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "@cf/meta/llama-3.1-8b-instruct-fp8",
  ];

  let lastError = "";
  for (const model of models) {
    try {
      const result: any = await env.AI.run(model as any, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 900,
      });
      const caption = result?.response || result?.result || result?.choices?.[0]?.message?.content || "";
      if (typeof caption === "string" && caption.trim().length > 20) {
        return { caption: caption.trim(), usedModel: model };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError || "AI failed to generate caption");
}

async function postToFacebook(caption: string, env: Env, pageId: string, pageToken: string) {
  if (!caption?.trim()) throw new Error("Caption is empty");
  const fbUrl = `${GRAPH_BASE}/${encodeURIComponent(pageId)}/feed`;
  const form = new URLSearchParams();
  form.append("message", caption.trim());
  form.append("access_token", pageToken);
  const response = await fetch(fbUrl, { method: "POST", body: form });
  const data: any = await response.json();
  if (!response.ok || data?.error) {
    const code = data?.error?.code;
    if (code === 200) throw new Error("Facebook rejected the Page token or its permissions for the selected Page.");
    if (code === 10) throw new Error("Facebook rejected this feed operation. Verify the selected Page token has publishing permission.");
    throw new Error(data?.error?.message || `Facebook API request failed (${response.status})`);
  }
  return { id: data.id, pageId, endpoint: `/${pageId}/feed` };
}

async function postImageToFacebook(caption: string, imageUrl: string, env: Env, pageId: string, pageToken: string) {
  if (!caption?.trim()) throw new Error("Caption is empty");
  if (!imageUrl?.trim()) throw new Error("Image URL is empty");
  if (imageUrl.startsWith("data:")) throw new Error("The image is not publicly hosted yet. Configure the image storage binding before publishing it to Facebook.");
  const fbUrl = `${GRAPH_BASE}/${encodeURIComponent(pageId)}/photos`;
  const form = new URLSearchParams();
  form.append("caption", caption.trim());
  form.append("url", imageUrl.trim());
  form.append("access_token", pageToken);
  const response = await fetch(fbUrl, { method: "POST", body: form });
  const data: any = await response.json();
  if (!response.ok || data?.error) throw new Error(data?.error?.message || `Facebook image API request failed (${response.status})`);
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
  if (!env.ASSETS) return null;
  const safeBrand = pageName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const key = `generated/${safeBrand}/${Date.now()}-${crypto.randomUUID()}.jpg`;
  await env.ASSETS.put(key, bytes, { httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000, immutable" } });
  const url = new URL(request.url);
  return `${url.origin}/api/autoposter/assets/${encodeURIComponent(key)}`;
}

apiRoutes.get("/autoposter/health", (c) => c.json({
  status: "ok",
  service: "Zawaago Autoposter",
  mode: "production-ready",
  graphVersion: GRAPH_VERSION,
  aiConfigured: !!c.env.AI,
  facebookTokenConfigured: !!(c.env.FB_TOKEN || c.env.FB_TOKEN_ZAWAAGO || c.env.FB_TOKEN_INNOTECH),
  zawaagoPageConfigured: !!c.env.PAGE_ID_ZAWAAGO,
  innotechPageConfigured: !!c.env.PAGE_ID_INNOTECH,
  zawaagoFacebookTokenConfigured: !!(c.env.FB_TOKEN_ZAWAAGO || c.env.FB_TOKEN),
  innotechFacebookTokenConfigured: !!(c.env.FB_TOKEN_INNOTECH || c.env.FB_TOKEN),
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
    const finalPrompt = buildImagePrompt(brief);

    try {
      const result: any = await c.env.AI.run("@cf/black-forest-labs/flux-1-schnell" as any, { prompt: finalPrompt, steps: 8, seed: Math.floor(Math.random() * 2147483647) });
      const bytes = imageBytesFromResult(result);
      if (bytes && bytes.length > 1000) {
        const storedUrl = await storeImage(c.env, bytes, c.req.raw, brief.pageName);
        if (storedUrl) return c.json({ imageUrl: storedUrl, prompt: finalPrompt, source: "cloudflare-flux-r2" });
        const binary = String.fromCharCode(...bytes);
        return c.json({ imageUrl: `data:image/jpeg;base64,${btoa(binary)}`, prompt: finalPrompt, source: "cloudflare-flux" });
      }
    } catch (error) {
      console.warn("Cloudflare image generation failed; using external fallback", error);
    }

    const width = brief.aspectRatio?.toLowerCase().includes("landscape") ? 1536 : 1024;
    const height = brief.aspectRatio?.toLowerCase().includes("portrait") ? 1536 : 1024;
    return c.json({
      imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=${width}&height=${height}&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`,
      prompt: finalPrompt,
      source: "external-fallback",
    });
  } catch (error) {
    return c.json({ error: "Image generation failed", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

apiRoutes.post("/autoposter/post-now", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const caption = String(body.caption || "").trim();
    const page = String(body.page || "Zawaago").trim();
    const imageUrl = String(body.imageUrl || "").trim();
    const withImage = Boolean(body.withImage);
    const pageId = getPageId(page, c.env);
    if (!pageId) return c.json({ error: `Page ID is not configured for ${page}` }, 400);
    const pageToken = getPageToken(page, c.env);
    if (withImage) return c.json({ ...(await postImageToFacebook(caption, imageUrl, c.env, pageId, pageToken)), postedAs: "photo" });
    return c.json({ ...(await postToFacebook(caption, c.env, pageId, pageToken)), postedAs: "feed" });
  } catch (error) {
    return c.json({ error: "Facebook post failed", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

apiRoutes.get("/autoposter", (c) => c.redirect("/"));
