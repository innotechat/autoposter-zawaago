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

apiRoutes.get("/sites", async (c) => {
  const sites = (await c.env.AEO_KV.get("sites", "json") as any[])?? [];
  return c.json(sites);
});
apiRoutes.get("/models", (c) => {
  return c.json({ total: 1, models: [{ name: "Llama 3.1", id: "llama-3.1", provider: "meta" }] });
});
apiRoutes.get("/autoposter/health", (c) => {
  return c.json({ status: "Autoposter OK", ai:!!c.env.AI, has_token:!!c.env.FB_TOKEN, page_zawaago:!!c.env.PAGE_ID_ZAWAAGO, page_innotech:!!c.env.PAGE_ID_INNOTECH, time: new Date().toISOString() });
});
apiRoutes.post("/autoposter/generate", async (c) => {
  try {
    const body = await c.req.json() as any;
    const topic = body.topic || "AI travel";
    const pageName = body.pageName || "Zawaago";
    const prompt = "You are expert social media manager for travel brand " + pageName + ". Topic: " + topic + ". Write viral Facebook caption in Hindi Devanagari + English tech words mix, 100-130 words, 2-3 emoji, 5 hashtags like #Zawaago #Travel, 1 CTA in Hindi.";
    let caption = "";
    let usedModel = "";
    try {
      const r: any = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct' as any, { prompt: prompt, max_tokens: 600 }, { gateway: { id: "default" } } as any);
      caption = r.response || r.result || "";
      usedModel = "llama-3.1 prompt";
    } catch (e) {}
    if (!caption) {
      try {
        const r: any = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct' as any, { messages: [{ role: "user", content: prompt }], max_tokens: 600 }, { gateway: { id: "default" } } as any);
        caption = r.response || r.result || "";
        usedModel = "llama-3.1 messages";
      } catch (e) {}
    }
    if (!caption) {
      try {
        const r: any = await c.env.AI.run('@cf/meta/llama-2-7b-chat-fp16' as any, { messages: [{ role: "user", content: prompt }] }, { gateway: { id: "default" } } as any);
        caption = r.response || r.result || "";
        usedModel = "llama-2";
      } catch (e: any) {
        return c.json({ error: "AI failed", details: e.message }, 500);
      }
    }
    if (!caption) return c.json({ error: "Empty caption" }, 500);
    const imageUrl = "https://picsum.photos/seed/" + encodeURIComponent(topic) + "/800/600";
    return c.json({ caption: caption, imageUrl: imageUrl, topic: topic, pageName: pageName, usedModel: usedModel });
  } catch (err: any) {
    return c.json({ error: "Generate exception", details: err.message || String(err) }, 500);
  }
});
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
    return c.json({ error: "Post exception", details: err.message }, 500);
  }
});
apiRoutes.get("/autoposter", (c) => {
  const html = '<!DOCTYPE html><html><head><title>Zawaago Autoposter</title><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"></head><body class="bg-gray-100 min-h-screen p-3 md:p-6"><div class="max-w-5xl mx-auto"><div class="bg-white p-4 rounded-xl shadow mb-4 flex justify-between items-center"><h1 class="text-xl font-bold">Zawaago + InnoTech Autoposter</h1><button onclick="checkHealth()" class="text-xs bg-gray-100 px-3 py-1 rounded">Check Health</button></div><div class="bg-white p-4 rounded-xl shadow mb-4"><div class="flex flex-wrap gap-2 items-end"><div><label class="text-xs font-bold text-gray-500">PAGE</label><br><select id="page" class="border p-2.5 rounded-lg w-36"><option>Zawaago</option><option>InnoTech</option></select></div><div class="flex-1 min-w-[200px]"><label class="text-xs font-bold text-gray-500">TOPIC</label><br><input id="topic" class="border p-2.5 rounded-lg w-full" placeholder="e.g. AI se Manali trip" value="AI se travel planning"></div><button id="genBtn" onclick="generate()" class="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-bold">Generate</button></div><div id="progressWrap" class="hidden mt-4"><div class="w-full bg-gray-200 rounded-full h-2.5"><div id="progressBar" class="bg-blue-600 h-2.5 rounded-full" style="width:10%"></div></div><div id="progressText" class="text-xs text-gray-500 mt-1">Starting...</div></div></div><div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div class="bg-white p-4 rounded-xl shadow"><div class="flex justify-between"><label class="text-sm font-bold">Caption</label><span id="modelUsed" class="text-[10px] bg-gray-100 px-2 py-1 rounded"></span></div><textarea id="caption" class="w-full h-72 border p-3 mt-2 text-sm rounded-lg" placeholder="Caption yahan ayega..."></textarea><button id="postBtn" onclick="postNow()" class="bg-green-600 text-white w-full py-3 rounded-lg mt-3 font-bold">Post Now to Facebook</button><div id="log" class="text-xs bg-gray-50 p-3 mt-3 rounded-lg break-all whitespace-pre-wrap max-h-40 overflow-auto">Ready to generate...</div></div><div class="bg-white p-4 rounded-xl shadow"><label class="text-sm font-bold">Image Preview</label><img id="img" class="mt-2 w-full h-72 object-cover rounded-lg bg-gray-50 border"/><div class="text-[11px] text-gray-400 mt-2">Image auto from topic.</div><button onclick="copyCaption()" class="w-full mt-3 bg-gray-800 text-white py-2 rounded-lg text-sm">Copy Caption</button></div></div></div><script>function setProgress(p,txt){document.getElementById("progressWrap").classList.remove("hidden");document.getElementById("progressBar").style.width=p+"%";document.getElementById("progressText").innerText=txt;}function resetProgress(){setTimeout(function(){document.getElementById("progressWrap").classList.add("hidden");},1500);}async function checkHealth(){setProgress(20,"Checking health...");try{const r=await fetch("/api/autoposter/health");const d=await r.json();document.getElementById("log").innerText=JSON.stringify(d,null,2);setProgress(100,"Health OK - AI:"+d.ai+" Token:"+d.has_token);resetProgress();}catch(e){document.getElementById("log").innerText="Health Error: "+e.message;setProgress(100,"Error");}}async function generate(){const topic=document.getElementById("topic").value;const page=document.getElementById("page").value;const btn=document.getElementById("genBtn");if(!topic){alert("Topic likho");return;}btn.disabled=true;btn.innerHTML="Generating...";setProgress(20,"Connecting AI...");document.getElementById("log").innerText="Generating for: "+topic+" Page:"+page;document.getElementById("log").className="text-xs bg-blue-50 p-3 mt-3 rounded-lg";try{setProgress(50,"AI likh raha hai... 5-10 sec");const res=await fetch("/api/autoposter/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:topic,pageName:page})});setProgress(80,"Parsing...");const text=await res.text();let data;try{data=JSON.parse(text);}catch(e){data={error:"Invalid JSON",raw:text.slice(0,500)}}if(data.error){document.getElementById("log").innerText="ERROR: "+JSON.stringify(data,null,2);document.getElementById("log").className="text-xs bg-red-100 text-red-700 p-3 mt-3 rounded-lg";setProgress(100,"Failed: "+data.error);}else{document.getElementById("caption").value=data.caption;document.getElementById("img").src=data.imageUrl;document.getElementById("modelUsed").innerText=data.usedModel||"";document.getElementById("log").innerText="SUCCESS! Model:"+(data.usedModel||"")+" Length:"+data.caption.length;document.getElementById("log").className="text-xs bg-green-50 text-green-700 p-3 mt-3 rounded-lg";setProgress(100,"Done! Ready to Post");}}catch(e){document.getElementById("log").innerText="Network Error: "+e.message;document.getElementById("log").className="text-xs bg-red-100 p-3 mt-3 rounded-lg";setProgress(100,"Network Error");}finally{btn.disabled=false;btn.innerHTML="Generate";resetProgress();}}async function postNow(){const caption=document.getElementById("caption").value;const page=document.getElementById("page").value;const btn=document.getElementById("postBtn");if(!caption){alert("Pehle Generate karo");return;}btn.disabled=true;btn.innerHTML="Posting...";setProgress(30,"Posting to "+page+"...");try{const res=await fetch("/api/autoposter/post-now",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({caption:caption,page:page})});const data=await res.json();setProgress(100,"Facebook Response");document.getElementById("log").innerText=JSON.stringify(data,null,2);if(data.id){document.getElementById("log").className="text-xs bg-green-100 text-green-700 p-3 mt-3 rounded-lg";alert("Posted! Check Page");}else{document.getElementById("log").className="text-xs bg-red-100 text-red-700 p-3 mt-3 rounded-lg";}}catch(e){document.getElementById("log").innerText="Post Error: "+e.message;setProgress(100,"Error");}finally{btn.disabled=false;btn.innerHTML="Post Now to Facebook";resetProgress();}}function copyCaption(){const c=document.getElementById("caption").value;if(!c){alert("Nothing");return;}navigator.clipboard.writeText(c);document.getElementById("log").innerText="Copied!";}window.onload=checkHealth;</script></body></html>';
  return c.html(html);
});