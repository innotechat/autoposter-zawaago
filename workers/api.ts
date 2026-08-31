import { Hono } from "hono";

type Env = {
  AI: Ai;
  AEO_KV: KVNamespace;
  BRAND_VISIBILITY_QUEUE: Queue;
  TARGET_DOMAIN: string;
  FB_TOKEN: string;
  PAGE_ID_ZAWAAGO: string;
  PAGE_ID_INNOTECH: string;
};

export const apiRoutes = new Hono<{ Bindings: Env }>();

// --- HEALTH ---
apiRoutes.get("/sites", async (c) => {
  const sites = (await c.env.AEO_KV.get("sites", "json") as any[])?? [];
  return c.json(sites);
});

apiRoutes.get("/models", (c) => {
  return c.json({ total: 1, models: [{ name: "Llama 3.1", id: "llama-3.1", provider: "meta" }] });
});

apiRoutes.get("/autoposter/health", (c) => {
  return c.json({
    status: "Autoposter OK",
    ai:!!c.env.AI,
    has_token:!!c.env.FB_TOKEN,
    page_zawaago:!!c.env.PAGE_ID_ZAWAAGO,
    page_innotech:!!c.env.PAGE_ID_INNOTECH,
    time: new Date().toISOString()
  });
});

// --- GENERATE CAPTION ---
apiRoutes.post("/autoposter/generate", async (c) => {
  try {
    const body = await c.req.json() as any;
    const topic = body.topic || "AI travel";
    const pageName = body.pageName || "Zawaago";

    const prompt = `You are expert social media manager for travel brand ${pageName}. Topic: ${topic}. Write viral Facebook caption in Hindi (Devanagari) + English tech words mix, 100-130 words, engaging, add emoji 2-3, add 5 hashtags (like #Zawaago #Travel), add 1 CTA in Hindi. Do NOT add English explanation.`;

    let caption = "";
    let usedModel = "";

    // Try 1: llama 3.1 with prompt
    try {
      const r: any = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct' as any,
        { prompt, max_tokens: 600 },
        { gateway: { id: "default" } } as any
      );
      caption = r.response || r.result || "";
      usedModel = "llama-3.1-8b prompt";
    } catch (e) {}

    // Try 2: llama 3.1 with messages
    if (!caption) {
      try {
        const r: any = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct' as any,
          { messages: [{ role: "user", content: prompt }], max_tokens: 600 },
          { gateway: { id: "default" } } as any
        );
        caption = r.response || r.result || r?.choices?.[0]?.message?.content || "";
        usedModel = "llama-3.1 messages";
      } catch (e) {}
    }

    // Try 3: llama 2 fallback
    if (!caption) {
      try {
        const r: any = await c.env.AI.run('@cf/meta/llama-2-7b-chat-fp16' as any,
          { messages: [{ role: "user", content: prompt }] },
          { gateway: { id: "default" } } as any
        );
        caption = r.response || r.result || "";
        usedModel = "llama-2 fallback";
      } catch (e: any) {
        return c.json({ error: "AI failed all models", details: e.message, usedModel }, 500);
      }
    }

    if (!caption) return c.json({ error: "Empty caption", usedModel }, 500);

    const imageUrl = "https://picsum.photos/seed/" + encodeURIComponent(topic) + "/800/600";
    return c.json({ caption, imageUrl, topic, pageName, usedModel });

  } catch (err: any) {
    return c.json({ error: "Generate exception", details: err?.message || String(err) }, 500);
  }
});

// --- POST NOW ---
apiRoutes.post("/autoposter/post-now", async (c) => {
  try {
    const body = await c.req.json() as any;
    const caption = body.caption;
    const page = body.page || "Zawaago";
    if (!caption) return c.json({ error: "Caption empty" }, 400);

    const pageId = page === "InnoTech"? c.env.PAGE_ID_INNOTECH : c.env.PAGE_ID_ZAWAAGO;
    if (!pageId) return c.json({ error: "Page ID not set for " + page }, 400);
    if (!c.env.FB_TOKEN) return c.json({ error: "FB_TOKEN not set" }, 400);

    const fbRes = await fetch("https://graph.facebook.com/v21.0/" + pageId + "/feed", {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ message: caption, access_token: c.env.FB_TOKEN })
    });
    const data: any = await fbRes.json();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: "Post exception", details: err?.message }, 500);
  }
});

// --- FINAL UI WITH PROGRESS ---
apiRoutes.get("/autoposter", (c) => {
  const html = `<!DOCTYPE html>
<html>
<head>
<title>Zawaago Autoposter</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>
<body class="bg-gray-100 min-h-screen p-3 md:p-6">
<div class="max-w-5xl mx-auto">
  <div class="bg-white p-4 rounded-xl shadow mb-4 flex justify-between items-center">
    <h1 class="text-xl md:text-2xl font-bold"><i class="fas fa-robot text-blue-600"></i> Zawaago + InnoTech Autoposter</h1>
    <button onclick="checkHealth()" class="text-xs bg-gray-100 px-3 py-1 rounded">Check Health</button>
  </div>

  <div class="bg-white p-4 rounded-xl shadow mb-4">
    <div class="flex flex-wrap gap-2 items-end">
      <div>
        <label class="text-xs font-bold text-gray-500">PAGE</label><br>
        <select id="page" class="border p-2.5 rounded-lg w-36"><option>Zawaago</option><option>InnoTech</option></select>
      </div>
      <div class="flex-1 min-w-[200px]">
        <label class="text-xs font-bold text-gray-500">TOPIC</label><br>
        <input id="topic" class="border p-2.5 rounded-lg w-full" placeholder="e.g. AI se Manali trip kaise plan kare" value="AI se travel planning">
      </div>
      <button id="genBtn" onclick="generate()" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold"><i class="fas fa-magic"></i> Generate</button>
    </div>
    <div id="progressWrap" class="hidden mt-4">
      <div class="w-full bg-gray-200 rounded-full h-2.5"><div id="progressBar" class="bg-blue-600 h-2.5 rounded-full" style="width: 10%"></div></div>
      <div id="progressText" class="text-xs text-gray-500 mt-1">Starting...</div>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div class="bg-white p-4 rounded-xl shadow">
      <div class="flex justify-between"><label class="text-sm font-bold">Caption</label><span id="modelUsed" class="text-[10px] bg-gray-100 px-2 py-1 rounded"></span></div>
      <textarea id="caption" class="w-full h-72 border p-3 mt-2 text-sm rounded-lg" placeholder="Caption yahan ayega..."></textarea>
      <button id="postBtn" onclick="postNow()" class="bg-green-600 hover:bg-green-700 text-white w-full py-3 rounded-lg mt-3 font-bold"><i class="fab fa-facebook"></i> Post Now to Facebook</button>
      <div id="log" class="text-xs bg-gray-50 p-3 mt-3 rounded-lg break-all whitespace-pre-wrap max-h-40 overflow-auto">Ready to generate...</div>
    </div>
    <div class="bg-white p-4 rounded-xl shadow">
      <label class="text-sm font-bold">Image Preview</label>
      <img id="img" class="mt-2 w-full h-72 object-cover rounded-lg bg-gray-50 border" />
      <div class="text-[11px] text-gray-400 mt-2">Image auto from topic (Unsplash style). Aap apni image baad me add kar sakte ho.</div>
      <button onclick="copyCaption()" class="w-full mt-3 bg-gray-800 text-white py-2 rounded-lg text-sm"><i class="fas fa-copy"></i> Copy Caption</button>
    </div>
  </div>
</div>

<script>
function setProgress(p, txt){document.getElementById('progressWrap').classList.remove('hidden');document.getElementById('progressBar').style.width=p+'%';document.getElementById('progressText').innerText=txt;}
function resetProgress(){setTimeout(()=>{document.getElementById('progressWrap').classList.add('hidden');},1500);}

async function checkHealth(){
  setProgress(20,'Checking health...');
  try{
    const r=await fetch('/api/autoposter/health');const d=await r.json();
    document.getElementById('log').innerText=JSON.stringify(d,null,2);
    setProgress(100,'Health OK - AI:'+d.ai+' Token:'+d.has_token);
    resetProgress();
  }catch(e){document.getElementById('log').innerText='Health Error: '+e.message;setProgress(100,'Error');}
}

async function generate(){
  const topic=document.getElementById('topic').value;
  const page=document.getElementById('page').value;
  const btn=document.getElementById('genBtn');
  if(!topic){alert('Topic likho');return;}
  btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Generating...';
  setProgress(20,'Connecting AI...');
  document.getElementById('log').innerText='Generating