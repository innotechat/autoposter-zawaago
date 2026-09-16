import { Hono } from "hono";
import {
  persistReelRecord,
  listReelRecords,
  deleteReelRecord,
  type ReelHistoryRecord,
} from "./reels-d1";

type Env = {
  AI: Ai;
  ASSETS?: R2Bucket;
  DB?: D1Database;
  SARVAM_API_KEY?: string;
};
type BrandName = "Zawaago" | "InnoTech" | "None" | "Custom";
type NormalizedScene = { scene: number; durationSeconds: number; narration: string; caption: string; visualPrompt: string };
type TtsLanguage = { label: string; sarvamCode?: string; meloCode?: string };

export const reelLabRoutes = new Hono<{ Bindings: Env }>();

const STORYBOARD_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "reel_storyboard",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        hook: { type: "string" },
        totalSeconds: { type: "number" },
        scenes: {
          type: "array",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              scene: { type: "integer" },
              durationSeconds: { type: "number" },
              narration: { type: "string" },
              caption: { type: "string" },
              visualPrompt: { type: "string" },
            },
            required: ["scene", "durationSeconds", "narration", "caption", "visualPrompt"],
          },
        },
      },
      required: ["title", "hook", "totalSeconds", "scenes"],
    },
  },
};

const TTS_LANGUAGES: Record<string, TtsLanguage> = {
  English: { label: "English", sarvamCode: "en-IN", meloCode: "en" },
  Hinglish: { label: "Hinglish", sarvamCode: "hi-IN" },
  Hindi: { label: "Hindi", sarvamCode: "hi-IN" },
  Bengali: { label: "Bengali", sarvamCode: "bn-IN" },
  Tamil: { label: "Tamil", sarvamCode: "ta-IN" },
  Telugu: { label: "Telugu", sarvamCode: "te-IN" },
  Kannada: { label: "Kannada", sarvamCode: "kn-IN" },
  Malayalam: { label: "Malayalam", sarvamCode: "ml-IN" },
  Marathi: { label: "Marathi", sarvamCode: "mr-IN" },
  Gujarati: { label: "Gujarati", sarvamCode: "gu-IN" },
  Punjabi: { label: "Punjabi", sarvamCode: "pa-IN" },
  Odia: { label: "Odia", sarvamCode: "od-IN" },
};

const SARVAM_SPEAKERS = new Set([
  "shubh", "aditya", "ritu", "priya", "neha", "rahul", "pooja", "rohan", "simran", "kavya", "amit", "dev", "ishita", "shreya", "ratan", "varun", "manan", "sumit", "roopa", "kabir", "aayan", "ashutosh", "advait", "anand", "tanya", "tarun", "sunny", "mani", "gokul", "vijay", "shruti", "suhani", "mohit", "kavitha", "rehan", "soham", "rupali",
]);

function normalizeBrand(value: string): BrandName {
  const brand = value.trim().toLowerCase();
  if (brand === "zawaago") return "Zawaago";
  if (brand === "innotech" || brand === "inno tech") return "InnoTech";
  if (brand === "none" || brand === "no brand" || brand === "unbranded" || brand === "") return "None";
  if (brand === "custom") return "Custom";
  return "Zawaago";
}

function parseResult(result: any) {
  const raw = result?.response ?? result?.result ?? result?.choices?.[0]?.message?.content ?? "";
  if (typeof raw !== "string") return raw;
  return JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
}

function normalizeStoryboard(value: any) {
  const scenes: any[] = Array.isArray(value?.scenes) ? value.scenes.slice(0, 5) : [];
  if (scenes.length !== 5) throw new Error("Storyboard must contain exactly 5 scenes.");
  const normalized: NormalizedScene[] = scenes.map((scene: any, index: number) => ({
    scene: index + 1,
    durationSeconds: Math.max(3, Math.min(12, Number(scene.durationSeconds) || 7)),
    narration: String(scene.narration || "").trim(),
    caption: String(scene.caption || "").trim(),
    visualPrompt: String(scene.visualPrompt || "").trim(),
  }));
  if (normalized.some((scene) => scene.narration.length < 8 || scene.visualPrompt.length < 20)) throw new Error("Storyboard contains incomplete scenes.");
  const total = normalized.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  return {
    title: String(value?.title || "AI Agent vs Chatbot").trim(),
    hook: String(value?.hook || normalized[0].caption).trim(),
    totalSeconds: Number(total.toFixed(1)),
    scenes: normalized,
  };
}

reelLabRoutes.post("/reel-lab/storyboard", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const pageName = normalizeBrand(String(body.pageName || "Zawaago"));
    const topic = String(body.topic || "AI Agent vs Chatbot — what is the real difference?").trim();
    const language = String(body.language || "Hinglish").trim();
    const audience = String(body.audience || "Business Owners and Professionals").trim();
    const sourceCaption = String(body.sourceCaption || "").trim();
    const brandContext = pageName === "None" || pageName === "Custom"
      ? "You are a senior short-form educational video strategist. Create one original 35-45 second faceless educational Reel storyboard"
      : `You are the senior short-form educational video strategist for ${pageName}. Create one original 35-45 second faceless educational Reel storyboard`;
    const prompt = `${brandContext} about: ${topic}.\n\nAudience: ${audience}\nLanguage: ${language}\nBrand positioning: practical, credible AI and technology education.\n${sourceCaption ? `Source post context (use as context, do not repeat it verbatim): ${sourceCaption.slice(0, 900)}\n` : ""}\nCreate exactly five scenes:\n1) 0-3/4 sec: a strong non-clickbait hook.\n2) Problem/misconception.\n3) Clear explanation.\n4) Concrete business example or workflow.\n5) Takeaway + natural follow CTA.\n\nRules:\n- Teach one useful idea; do not use filler.\n- Use natural spoken ${language}. Hindi must use Devanagari; Hinglish should mix Hindi and English naturally; regional languages should use their native script.\n- No fake statistics, invented case studies, unsupported claims or exaggerated promises.\n- Narration must sound natural when spoken aloud.\n- Caption should be short enough for mobile viewing and match the narration.\n- VisualPrompt must describe only the visual scene. Never request logos, brand names, text, letters, numbers, subtitles, watermarks or fake UI inside the generated artwork. Leave safe negative space for later branding/captions.\n- Use visually different scenes with a coherent premium editorial style.\n- Return valid JSON matching the supplied schema.`;
    const models = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/google/gemma-4-26b-a4b-it"];
    let lastError = "";
    for (const model of models) {
      try {
        const result: any = await c.env.AI.run(model as any, {
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2200,
          temperature: 0.55,
          response_format: STORYBOARD_SCHEMA,
        });
        return c.json({ ...normalizeStoryboard(parseResult(result)), pageName, language, audience, model });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    return c.json({ error: "Reel storyboard generation failed", details: lastError || "No storyboard was returned." }, 503);
  } catch (error) {
    return c.json({ error: "Reel storyboard generation failed", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

function toBytes(base64: string) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function generateSarvamAudio(apiKey: string, text: string, language: TtsLanguage, speaker: string) {
  if (!language.sarvamCode) throw new Error(`Sarvam TTS does not support ${language.label}.`);
  if (text.length > 2400) throw new Error(`${language.label} narration is too long for a single Sarvam request. Keep the Reel narration under 2,400 characters.`);
  const selectedSpeaker = SARVAM_SPEAKERS.has(speaker) ? speaker : "shubh";
  const response = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-subscription-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model: "bulbul:v3",
      language_code: language.sarvamCode,
      speaker: selectedSpeaker,
      pace: 1,
      temperature: 0.6,
      speech_sample_rate: 24000,
    }),
  });
  if (!response.ok) throw new Error(`Sarvam TTS returned HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const data: any = await response.json();
  const encoded = data?.audios?.[0];
  if (typeof encoded !== "string" || encoded.length < 32) throw new Error("Sarvam TTS returned no audio data.");
  return toBytes(encoded);
}

async function generateMeloAudio(ai: Ai, text: string, language: TtsLanguage) {
  if (!language.meloCode) throw new Error(`MeloTTS does not support ${language.label}.`);
  const result: any = await ai.run("@cf/myshell-ai/melotts" as any, { prompt: text, lang: language.meloCode });
  if (result instanceof ArrayBuffer) return new Uint8Array(result);
  if (result instanceof Uint8Array) return result;
  if (result instanceof ReadableStream) return new Uint8Array(await new Response(result).arrayBuffer());
  if (typeof result?.audio === "string") return toBytes(result.audio);
  if (result?.body instanceof ReadableStream) return new Uint8Array(await new Response(result.body).arrayBuffer());
  throw new Error("MeloTTS returned an unsupported audio response.");
}

function audioBody(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

reelLabRoutes.post("/reel-lab/tts", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const text = String(body.text || "").trim();
    const requestedLanguage = String(body.language || "Hinglish").trim();
    const speaker = String(body.speaker || "shubh").trim().toLowerCase();
    const language = TTS_LANGUAGES[requestedLanguage];
    if (!text) return c.json({ error: "Narration text is required" }, 400);
    if (!language) return c.json({ error: `Unsupported Reel language: ${requestedLanguage}` }, 400);
    if (text.length > 5000) return c.json({ error: "Narration is too long for the Reel composer." }, 413);

    if (requestedLanguage === "English") {
      const audio = await generateMeloAudio(c.env.AI, text, language);
      return new Response(audioBody(audio), {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-TTS-Provider": "melotts", "X-TTS-Language": requestedLanguage },
      });
    }

    const apiKey = c.env.SARVAM_API_KEY?.trim();
    if (!apiKey) return c.json({ error: "Sarvam TTS is not configured.", details: "Add the SARVAM_API_KEY Worker secret before generating Hindi, Hinglish or Indian-language Reels." }, 503);
    const audio = await generateSarvamAudio(apiKey, text, language, speaker);
    return new Response(audioBody(audio), {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store", "X-TTS-Provider": "sarvam-bulbul-v3", "X-TTS-Language": requestedLanguage },
    });
  } catch (error) {
    return c.json({ error: "Reel voice generation failed", details: error instanceof Error ? error.message : String(error) }, 503);
  }
});

reelLabRoutes.post("/reel-lab/assets", async (c) => {
  try {
    if (!c.env.ASSETS) return c.json({ error: "Asset storage is not configured." }, 503);
    const form = await c.req.formData();
    const pageName = normalizeBrand(String(form.get("pageName") || "Zawaago"));
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "Reel video file is required." }, 400);
    const contentType = file.type.toLowerCase();
    if (contentType !== "video/mp4") return c.json({ error: "Only MP4 Reels are accepted for production storage." }, 415);
    if (file.size < 1000) return c.json({ error: "Reel file is unexpectedly small." }, 400);
    if (file.size > 100 * 1024 * 1024) return c.json({ error: "Reel file exceeds the 100 MB upload limit." }, 413);
    const safeBrand = pageName === "InnoTech" ? "innotech" : pageName === "None" || pageName === "Custom" ? "unbranded" : "zawaago";
    const key = `generated/${safeBrand}/reels/${Date.now()}-${crypto.randomUUID()}.mp4`;
    const bytes = await file.arrayBuffer();
    await c.env.ASSETS.put(key, bytes, { httpMetadata: { contentType: "video/mp4", cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { brand: safeBrand, source: "reel-composer", format: "mp4" } });
    const saved = await c.env.ASSETS.head(key);
    if (!saved) return c.json({ error: "Reel upload could not be verified in R2." }, 502);
    const videoUrl = `${new URL(c.req.url).origin}/api/autoposter/assets/${encodeURIComponent(key)}`;

    // Build structured ReelHistoryRecord for D1 & R2
    const reelId = `reel_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const caption = String(form.get("caption") || "").trim();
    const title = String(form.get("title") || "").trim() || `${pageName} AI Reel`;
    const topic = String(form.get("topic") || "").trim() || "Social Media Engagement";
    const language = String(form.get("language") || "English").trim();
    const durationSeconds = Number(form.get("durationSeconds") || 35);
    const thumbnailUrl = String(form.get("thumbnailUrl") || "").trim();
    const scenesJson = String(form.get("scenesJson") || "").trim();

    const reelRecord: ReelHistoryRecord = {
      id: reelId,
      brand: pageName,
      topic,
      title,
      language,
      durationSeconds,
      videoUrl,
      r2Key: key,
      thumbnailUrl: thumbnailUrl || undefined,
      caption: caption || undefined,
      scenesJson: scenesJson || undefined,
      status: "ready",
      createdAt: new Date().toISOString(),
    };

    await persistReelRecord(c.env, reelRecord);

    return c.json({
      ok: true,
      pageName,
      key,
      videoUrl,
      size: file.size,
      contentType,
      etag: saved.httpEtag,
      reel: reelRecord,
    });
  } catch (error) {
    return c.json({ error: "Reel asset upload failed", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// GET /api/reel-lab/history - D1 Reel History with relational queries & R2 fallback
reelLabRoutes.get("/reel-lab/history", async (c) => {
  try {
    const brand = c.req.query("brand");
    const limit = Number(c.req.query("limit") || 50);
    const reels = await listReelRecords(c.env, brand, limit);
    return c.json({ ok: true, reels, count: reels.length });
  } catch (error) {
    return c.json({ error: "Failed to fetch reel history", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// DELETE /api/reel-lab/history/:id - Delete Reel record from D1 and purge binary from R2
reelLabRoutes.delete("/reel-lab/history/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const brand = c.req.query("brand") || "Zawaago";
    if (!id) return c.json({ error: "Reel id is required." }, 400);
    const result = await deleteReelRecord(c.env, id, brand);
    return c.json({ id, message: "Reel deleted from D1 and R2 storage.", ...result });
  } catch (error) {
    return c.json({ error: "Failed to delete reel", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});
