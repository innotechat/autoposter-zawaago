import { Hono } from "hono";

type Env = { AI: Ai; ASSETS?: R2Bucket };
type NormalizedScene = { scene: number; durationSeconds: number; narration: string; caption: string; visualPrompt: string };
export const reelLabRoutes = new Hono<{ Bindings: Env }>();

const STORYBOARD_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "reel_storyboard",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" }, hook: { type: "string" }, totalSeconds: { type: "number" },
        scenes: { type: "array", minItems: 5, maxItems: 5, items: { type: "object", properties: { scene: { type: "integer" }, durationSeconds: { type: "number" }, narration: { type: "string" }, caption: { type: "string" }, visualPrompt: { type: "string" } }, required: ["scene", "durationSeconds", "narration", "caption", "visualPrompt"] } },
      },
      required: ["title", "hook", "totalSeconds", "scenes"],
    },
  },
};

function parseResult(result: any) { const raw = result?.response ?? result?.result ?? result?.choices?.[0]?.message?.content ?? ""; if (typeof raw !== "string") return raw; return JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")); }
function normalizeStoryboard(value: any) {
  const scenes: any[] = Array.isArray(value?.scenes) ? value.scenes.slice(0, 5) : [];
  if (scenes.length !== 5) throw new Error("Storyboard must contain exactly 5 scenes.");
  const normalized: NormalizedScene[] = scenes.map((scene: any, index: number) => ({ scene: index + 1, durationSeconds: Math.max(3, Math.min(12, Number(scene.durationSeconds) || 7)), narration: String(scene.narration || "").trim(), caption: String(scene.caption || "").trim(), visualPrompt: String(scene.visualPrompt || "").trim() }));
  if (normalized.some((scene) => scene.narration.length < 8 || scene.visualPrompt.length < 20)) throw new Error("Storyboard contains incomplete scenes.");
  const total = normalized.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  return { title: String(value?.title || "AI Agent vs Chatbot").trim(), hook: String(value?.hook || normalized[0].caption).trim(), totalSeconds: Number(total.toFixed(1)), scenes: normalized };
}

reelLabRoutes.post("/reel-lab/storyboard", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const pageName = String(body.pageName || "Zawaago").trim(); const topic = String(body.topic || "AI Agent vs Chatbot — what is the real difference?").trim(); const language = String(body.language || "Hinglish").trim(); const audience = String(body.audience || "Business Owners and Professionals").trim();
    const prompt = `You are the senior short-form educational video strategist for ${pageName}. Create one original 35-45 second faceless educational Reel storyboard about: ${topic}.\n\nAudience: ${audience}\nLanguage: ${language}\nBrand positioning: practical, credible AI and technology education.\n\nCreate exactly five scenes:\n1) 0-3/4 sec: a strong non-clickbait hook.\n2) Problem/misconception.\n3) Clear explanation.\n4) Concrete business example or workflow.\n5) Takeaway + natural follow CTA.\n\nRules:\n- Teach one useful idea; do not use filler.\n- Use natural spoken ${language}; Hindi should use Devanagari, Hinglish can mix Hindi and English naturally.\n- No fake statistics, invented case studies, unsupported claims or exaggerated promises.\n- Narration must sound natural when spoken aloud.\n- Caption should be short enough for mobile viewing and match the narration.\n- VisualPrompt must describe only the visual scene. Never request logos, brand names, text, letters, numbers, subtitles, watermarks or fake UI inside the generated artwork. Leave safe negative space for later branding/captions.\n- Use visually different scenes with a coherent premium editorial style.\n- Return valid JSON matching the supplied schema.`;
    const models = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/google/gemma-4-26b-a4b-it"]; let lastError = "";
    for (const model of models) { try { const result: any = await c.env.AI.run(model as any, { messages: [{ role: "user", content: prompt }], max_tokens: 2200, temperature: 0.55, response_format: STORYBOARD_SCHEMA }); return c.json({ ...normalizeStoryboard(parseResult(result)), pageName, language, audience, model }); } catch (error) { lastError = error instanceof Error ? error.message : String(error); } }
    return c.json({ error: "Reel storyboard generation failed", details: lastError || "No storyboard was returned." }, 503);
  } catch (error) { return c.json({ error: "Reel storyboard generation failed", details: error instanceof Error ? error.message : String(error) }, 500); }
});

reelLabRoutes.post("/reel-lab/tts", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})); const text = String(body.text || "").trim(); const speaker = String(body.speaker || "luna").trim(); if (!text) return c.json({ error: "Narration text is required" }, 400); if (text.length > 5000) return c.json({ error: "Narration is too long for the Reel Lab test" }, 413);
    const result: any = await c.env.AI.run("@cf/deepgram/aura-2-en" as any, { text, speaker, encoding: "mp3" }); let audio: ArrayBuffer;
    if (result instanceof ArrayBuffer) audio = result; else if (result instanceof Uint8Array) audio = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer; else if (result instanceof ReadableStream) audio = await new Response(result).arrayBuffer(); else if (typeof result?.audio === "string") { const binary = atob(result.audio); audio = Uint8Array.from(binary, (char) => char.codePointAt(0) || 0).buffer; } else if (result?.body instanceof ReadableStream) audio = await new Response(result.body).arrayBuffer(); else throw new Error("TTS provider returned an unsupported audio response.");
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (error) { return c.json({ error: "Reel voice generation failed", details: error instanceof Error ? error.message : String(error) }, 503); }
});

reelLabRoutes.post("/reel-lab/assets", async (c) => {
  try {
    if (!c.env.ASSETS) return c.json({ error: "Asset storage is not configured." }, 503);
    const form = await c.req.formData(); const pageName = String(form.get("pageName") || "Zawaago").trim(); const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "Reel video file is required." }, 400);
    const contentType = file.type.toLowerCase(); if (contentType !== "video/mp4") return c.json({ error: "Only MP4 Reels are accepted for production storage." }, 415); if (file.size < 1000) return c.json({ error: "Reel file is unexpectedly small." }, 400); if (file.size > 100 * 1024 * 1024) return c.json({ error: "Reel file exceeds the 100 MB upload limit." }, 413);
    const safeBrand = pageName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "zawaago"; const key = `generated/${safeBrand}/reels/${Date.now()}-${crypto.randomUUID()}.mp4`;
    await c.env.ASSETS.put(key, file.stream(), { httpMetadata: { contentType: "video/mp4", cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { brand: safeBrand, source: "reel-lab", format: "mp4" } });
    return c.json({ ok: true, pageName, key, videoUrl: `${new URL(c.req.url).origin}/api/autoposter/assets/${encodeURIComponent(key)}`, size: file.size, contentType });
  } catch (error) { return c.json({ error: "Reel asset upload failed", details: error instanceof Error ? error.message : String(error) }, 500); }
});
