import { Hono } from "hono";
import { MODELS, RETENTION_DAYS, SETUP_MODEL } from "../src/config";

type Env = {
  AI: Ai;
  AEO_KV: KVNamespace;
  BRAND_VISIBILITY_QUEUE: Queue;
  TARGET_DOMAIN: string;
  FB_TOKEN: string;
  PAGE_ID_ZAWAAGO: string;
  PAGE_ID_INNOTECH: string;
};

type Site = { domain: string; brandName?: string; competitors?: string[]; description?: string; addedAt: string; };
type IndexEntry = { id: string; timestamp: string; rate: number; modelCount: number; };
type TestRun = { id: string; domain: string; startedAt: string; status: "running" | "complete"; total: number; completed: number; citations: any[]; summary?: any; };
type Prompt = { text: string; active: boolean; };
export type QueueJob = { testId: string; domain: string; modelId: string; modelName: string; provider: string; prompt: string; maxTokens: number; isGemini?: boolean; isAnthropic?: boolean; };

export const apiRoutes = new Hono<{ Bindings: Env }>();

// --- ORIGINAL ROUTES ---
apiRoutes.get("/sites", async (c) => {
  const sites = (await c.env.AEO_KV.get("sites", "json") as Site[]) ?? [];
  return c.json(sites);
});

apiRoutes.get("/models", (c) => {
  return c.json({ total: MODELS.length, models: MODELS.map((m) => ({ name: m.name, id: m.id, provider: m.provider })) });
});

// --- AUTOPOSTER ROUTES (SAFE) ---
apiRoutes.get("/autoposter/health", (c) => {
  return c.json({ status: "Autoposter OK", ai: !!c.env.AI, has_token: !!c.env.FB_TOKEN, time: new Date().toISOString() });
});

apiRoutes.post("/autoposter/generate", async (c) => {
  const body = await c.req.json() as any;
  const topic = body.topic || "AI";
  const pageName = body.pageName || "Zawaago";
  const prompt = "You are social media manager for " + pageName + ". Topic: " + topic + ". Write caption in Hindi Devanagari mix English tech words, 120 words, engaging, 5 hashtags, 1 CTA.";
  const r: any = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct' as any, { prompt, max_tokens: 500 });
  const caption = r.response || "Caption failed";
  const imageUrl = "https://source.unsplash.com/800x600/?" + encodeURIComponent(topic);
  return c.json({ caption, imageUrl, topic, pageName });
});

apiRoutes.post("/autoposter/post-now", async (c) => {
  const body = await c.req.json() as any;
  const caption = body.caption;
  const page = body.page || "Zawaago";
  const pageId = page === "InnoTech" ? c.env.PAGE_ID_INNOTECH : c.env.PAGE_ID_ZAWAAGO;
  if (!c.env.FB_TOKEN) return c.json({ error: "FB_TOKEN not set in Cloudflare Variables" }, 400);
  const fbRes = await fetch("https://graph.facebook.com/v21.0/" + pageId + "/feed", {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ message: caption, access_token: c.env.FB_TOKEN })
  });
  const data = await fbRes.json();
  return c.json(data);
});

apiRoutes.get("/autoposter", (c) => {
  const html = '<!DOCTYPE html><html><head><title>Autoposter</title><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-100 p-6"><div class="max-w-4xl mx-auto"><h1 class="text-2xl font-bold mb-4">Zawaago + InnoTech Autoposter</h1><div class="bg-white p-4 rounded border mb-4"><select id="page" class="border p-2 rounded"><option>Zawaago</option><option>InnoTech</option></select><input id="topic" class="border p-2 rounded w-80 ml-2" value="AI se travel planning"><button onclick="generate()" class="bg-blue-600 text-white px-4 py-2 rounded ml-2">Generate</button></div><div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div class="bg-white p-4 rounded border"><textarea id="caption" class="w-full h-64 border p-2 text-sm"></textarea><button onclick="postNow()" class="bg-green-600 text-white w-full py-2 rounded mt-2">Post Now</button><div id="log" class="text-xs bg-gray-50 p-2 mt-2 rounded break-all"></div></div><div class="bg-white p-4 rounded border"><img id="img" class="w-full h-64 object-cover bg-gray-50 rounded"/></div></div></div><script>async function generate(){const t=document.getElementById("topic").value;const p=document.getElementById("page").value;document.getElementById("log").innerText="Generating...";const r=await fetch("/api/autoposter/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:t,pageName:p})});const d=await r.json();document.getElementById("caption").value=d.caption||JSON.stringify(d);document.getElementById("img").src=d.imageUrl;document.getElementById("log").innerText="Ready";}async function postNow(){const cap=document.getElementById("caption").value;const p=document.getElementById("page").value;document.getElementById("log").innerText="Posting...";const r=await fetch("/api/autoposter/post-now",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({caption:cap,page:p})});const d=await r.json();document.getElementById("log").innerText=JSON.stringify(d);}</script></body></html>';
  return c.html(html);
});

// --- Helpers for old template (keep minimal) ---
async function getSites(env: Env): Promise<Site[]> { return ((await env.AEO_KV.get("sites", "json")) as Site[]) ?? []; }
function clean(d: string): string { return (d || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*/, "").trim(); }