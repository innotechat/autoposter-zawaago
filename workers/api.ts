import { Hono } from "hono";

type Env = {
  AI: Ai;
  FB_TOKEN: string;
  PAGE_ID_ZAWAAGO: string;
  PAGE_ID_INNOTECH: string;
};

export const apiRoutes = new Hono<{ Bindings: Env }>();

const GRAPH_VERSION = "v20.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function getPageId(page: string, env: Env): string {
  return page.toLowerCase() === "innotech" ? env.PAGE_ID_INNOTECH : env.PAGE_ID_ZAWAAGO;
}

function getPrompt(topic: string, pageName: string, contentType: string, tone: string): string {
  if (pageName.toLowerCase().includes("zawaago")) {
    return `You are the senior AI Business Consultant and Innovation Strategist for Zawaago. Zawaago provides AI Agents, AI Apps, business automation and innovation consulting. Create a LinkedIn/Facebook-ready post. Content type: ${contentType}. Topic: ${topic}. Tone: ${tone}. Requirements: 120-160 words; strong opening hook; explain a real business problem and value; give one practical insight or example; end with a consultation CTA; use Hindi + English only when the tone is Hinglish; maximum 3 emojis; exactly 5 useful hashtags including #Zawaago, #AIAgents and #BusinessInnovation; no fake statistics, exaggerated claims or fluff.`;
  }

  return `You are the technology educator for InnoTech. Create a LinkedIn/Facebook-ready educational post. Content type: ${contentType}. Topic: ${topic}. Tone: ${tone}. Requirements: about 120 words; simple explanation; one useful example; practical CTA; no fake statistics or fluff; include #InnoTech #AI #TechEducation.`;
}

async function generateCaption(env: Env, topic: string, pageName: string, contentType: string, tone: string) {
  const prompt = getPrompt(topic, pageName, contentType, tone);
  const models = [
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "@cf/meta/llama-3.1-8b-instruct-fp8",
  ];

  let lastError = "";
  for (const model of models) {
    try {
      const result: any = await env.AI.run(model as any, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 800,
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

async function postToFacebook(caption: string, env: Env, pageId: string) {
  if (!caption?.trim()) throw new Error("Caption is empty");
  if (!env.FB_TOKEN) throw new Error("FB_TOKEN is not configured");

  // TESTING MODE: the Page access token is used with /me/feed.
  // The supplied Page token is expected to resolve /me to the Page.
  const fbUrl = `${GRAPH_BASE}/me/feed`;
  const form = new URLSearchParams();
  form.append("message", caption.trim());
  form.append("access_token", env.FB_TOKEN);

  const response = await fetch(fbUrl, { method: "POST", body: form });
  const data: any = await response.json();

  if (!response.ok || data?.error) {
    console.error("FB ERROR", data?.error || data);
    const code = data?.error?.code;
    if (code === 200) throw new Error("Facebook rejected the token. Use a valid Page access token for the target Page.");
    if (code === 10) throw new Error("Facebook rejected this feed/story operation. Test text-only posting with the Page token.");
    throw new Error(data?.error?.message || `Facebook API request failed (${response.status})`);
  }

  return { id: data.id, pageId, endpoint: "/me/feed" };
}

async function postImageToFacebook(caption: string, imageUrl: string, env: Env, pageId: string) {
  if (!caption?.trim()) throw new Error("Caption is empty");
  if (!imageUrl?.trim()) throw new Error("Image URL is empty");
  if (imageUrl.startsWith("data:")) {
    throw new Error("Image posting test requires a public image URL. Data URLs are not accepted by Facebook's url parameter.");
  }
  if (!env.FB_TOKEN) throw new Error("FB_TOKEN is not configured");

  const fbUrl = `${GRAPH_BASE}/me/photos`;
  const form = new URLSearchParams();
  form.append("caption", caption.trim());
  form.append("url", imageUrl.trim());
  form.append("access_token", env.FB_TOKEN);

  const response = await fetch(fbUrl, { method: "POST", body: form });
  const data: any = await response.json();

  if (!response.ok || data?.error) {
    console.error("FB IMAGE ERROR", data?.error || data);
    throw new Error(data?.error?.message || `Facebook image API request failed (${response.status})`);
  }

  return { ...data, pageId, endpoint: "/me/photos" };
}

apiRoutes.get("/autoposter/health", (c) => {
  return c.json({
    status: "ok",
    service: "Zawaago Autoposter",
    mode: "testing",
    graphVersion: GRAPH_VERSION,
    aiConfigured: !!c.env.AI,
    facebookTokenConfigured: !!c.env.FB_TOKEN,
    zawaagoPageConfigured: !!c.env.PAGE_ID_ZAWAAGO,
    innotechPageConfigured: !!c.env.PAGE_ID_INNOTECH,
    timestamp: new Date().toISOString(),
  });
});

apiRoutes.post("/autoposter/generate", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const topic = String(body.topic || "How AI Agents save time for business owners").trim();
    const pageName = String(body.pageName || "Zawaago").trim();
    const contentType = String(body.contentType || "AI Agents & Automation").trim();
    const tone = String(body.tone || "Professional Hinglish").trim();
    const result = await generateCaption(c.env, topic, pageName, contentType, tone);

    const imagePrompt = `Professional business illustration for ${pageName}: ${topic}, AI agents and business innovation, clean modern editorial style`;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;

    return c.json({ ...result, imageUrl, imageGenerated: false, imageSource: "external-fallback", topic, pageName, contentType, tone });
  } catch (error) {
    return c.json({ error: "Generate failed", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

apiRoutes.post("/autoposter/generate-image", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const topic = String(body.topic || "AI Agents business").trim();
    const customPrompt = String(body.imgPrompt || "").trim();
    const finalPrompt = customPrompt || `Professional business illustration, ${topic}, AI agents, business innovation, minimal, modern, clean`;

    try {
      const result: any = await c.env.AI.run("@cf/black-forest-labs/flux-1-schnell" as any, { prompt: finalPrompt, steps: 4 });
      const bytes = result instanceof Uint8Array ? result : result instanceof ArrayBuffer ? new Uint8Array(result) : null;
      if (bytes && bytes.length > 1000) {
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
        }
        return c.json({ imageUrl: `data:image/png;base64,${btoa(binary)}`, prompt: finalPrompt, source: "cloudflare-flux" });
      }
    } catch (error) {
      console.warn("Cloudflare image generation failed; returning external image URL", error);
    }

    return c.json({
      imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 100000)}`,
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

    if (withImage) {
      if (!imageUrl) return c.json({ error: "Image URL is required when withImage=true" }, 400);
      return c.json({ ...(await postImageToFacebook(caption, imageUrl, c.env, pageId)), postedAs: "photo" });
    }

    return c.json({ ...(await postToFacebook(caption, c.env, pageId)), postedAs: "feed" });
  } catch (error) {
    return c.json({ error: "Facebook post failed", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

apiRoutes.get("/autoposter", (c) => {
  return c.redirect("/");
});
