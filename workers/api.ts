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
  return c.json({ total: 3, models: [{ name: "Llama 3.3 70B", id: "llama-3.3-70b-instruct-fp8-fast" }, { name: "Llama 3.1 8B FP8", id: "llama-3.1-8b-instruct-fp8" }, { name: "Flux Schnell", id: "flux-1-schnell" }] });
});
apiRoutes.get("/autoposter/health", (c) => {
  return c.json({ status: "Autoposter OK v2", ai:!!c.env.AI, has_token:!!c.env.FB_TOKEN, page_zawaago:!!c.env.PAGE_ID_ZAWAAGO, page_innotech:!!c.env.PAGE_ID_INNOTECH, time: new Date().toISOString(), models: ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fp8", "@cf/black-forest-labs/flux-1-schnell"] });
});

// Helper: page-specific system prompt for Zawaago = AI Agents/Business Consultant
function getPrompt(topic: string, pageName: string, contentType: string, tone: string) {
  const isZawaago = pageName.toLowerCase().includes("zawaago");
  if (isZawaago) {
    return `You are senior AI Business Consultant and Innovation Strategist for brand "Zawaago" - we build AI Agents, AI Apps, automation for businesses. Content Type: ${contentType}. Topic: ${topic}. Tone: ${tone}. Write LinkedIn/Facebook ready post. Rules: 120-160 words, start with hook, explain business value, give 1 practical insight, end with CTA for consultation. Use Hindi + English mix if tone is Hinglish, else English professional. Add 2-3 emoji max. Add 5 hashtags including #Zawaago #AIAgents #BusinessInnovation. No fluff.`;
  } else {
    return `You are Tech Educator for "InnoTech". Content Type: ${contentType}. Topic: ${topic}. Tone: ${tone}. Write educational post about ${topic}, 120 words, simple explanation, 1 example, CTA to learn. Add hashtags #InnoTech #AI #TechEducation.`;
  }
}

apiRoutes.post("/autoposter/generate", async (c) => {
  try {
    const body = await c.req.json() as any;
    const topic = body.topic || "How AI Agents save 20 hours/week for founders";
    const pageName = body.pageName || "Zawaago";
    const contentType = body.contentType || "AI Agents & Automation";
    const tone = body.tone || "Professional Hinglish";

    const prompt = getPrompt(topic, pageName, contentType, tone);
    const MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fp8", "@cf/meta/llama-3.2-3b-instruct"];

    let caption = "";
    let usedModel = "";
    let lastErr = "";
    for (const model of MODELS) {
      try {
        const r: any = await c.env.AI.run(model as any, { messages: [{ role: "user", content: prompt }], max_tokens: 800 }, { gateway: { id: "default" } } as any);
        caption = r.response || r.result || r.choices?.[0]?.message?.content || "";
        if (caption && caption.length > 20) { usedModel = model; break; }
      } catch (e: any) { lastErr = e.message; }
    }
    if (!caption) return c.json({ error: "AI failed all models", details: lastErr, tried: MODELS }, 500);

    let imageUrl = "https://picsum.photos/seed/" + encodeURIComponent(topic) + "/800/600";
    let imageGenerated = false;
    try {
      const imgPrompt = isZawaagoPrompt(pageName)? `Futuristic AI agent dashboard, business innovation, ${topic}, minimal, professional, 8k` : `Tech illustration ${topic}, modern, clean`;
      const imageResult: any = await c.env.AI.run('@cf/black-forest-labs/flux-1-schnell' as any, { prompt: imgPrompt, steps: 4 }, { gateway: { id: "default" } } as any);
      if (imageResult) {
        let bytes: Uint8Array | null = null;
        if (imageResult instanceof Uint8Array) bytes = imageResult;
        else if (imageResult instanceof ArrayBuffer) bytes = new Uint8Array(imageResult);
        if (bytes && bytes.length > 1000) {
          let binary = "";
          const chunk = 8192;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, Array.from(bytes.slice(i, i + chunk)) as any);
          }
          const b64 = btoa(binary);
          imageUrl = "data:image/png;base64," + b64;
          imageGenerated = true;
        }
      }
    } catch (e) { }

    return c.json({ caption: caption.trim(), imageUrl: imageUrl, imageGenerated: imageGenerated, topic: topic, pageName: pageName, usedModel: usedModel, contentType: contentType, tone: tone });
  } catch (err: any) {
    return c.json({ error: "Generate exception", details: err.message || String(err) }, 500);
  }
});

function isZawaagoPrompt(pageName: string) { return pageName.toLowerCase().includes("zawaago"); }

apiRoutes.post("/autoposter/generate-image", async (c) => {
  try {
    const body = await c.req.json() as any;
    const topic = body.topic || "AI Agents business dashboard";
    const customPrompt = body.imgPrompt || "";
    const finalPrompt = customPrompt || `Professional business illustration of ${topic}, AI agents working, futuristic minimal, 8k, vibrant, clean background`;

    // Try Flux first, then fallback to SDXL
    const MODELS = [
      '@cf/black-forest-labs/flux-1-schnell',
      '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      '@cf/bytedance/stable-diffusion-xl-lightning'
    ];

    let imageUrl = "";
    let lastErr = "";
    
    for (const model of MODELS) {
      try {
        const inputs: any = { prompt: finalPrompt };
        if (model.includes("flux")) inputs.steps = 4;
        if (model.includes("stable-diffusion")) inputs.num_steps = 20;

        const result: any = await c.env.AI.run(model as any, inputs, { gateway: { id: "default" } } as any);
        
        let bytes: Uint8Array | null = null;
        if (result instanceof Uint8Array) bytes = result;
        else if (result instanceof ArrayBuffer) bytes = new Uint8Array(result);
        else if (result && result.byteLength) bytes = new Uint8Array(result);
        
        if (bytes && bytes.length > 5000) {
          // Fast base64
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          imageUrl = "data:image/png;base64," + btoa(binary);
          break;
        }
      } catch (e: any) {
        lastErr = e.message;
        continue;
      }
    }

    if (!imageUrl) return c.json({ error: "Image generation failed", details: lastErr, tried: MODELS }, 500);
    return c.json({ imageUrl: imageUrl, prompt: finalPrompt });
  } catch (e: any) {
    return c.json({ error: "Image exception", details: e.message }, 500);
  }
});

apiRoutes.post("/autoposter/post-now", async (c) => {
  try {
    const body = await c.req.json() as any;
    const caption = body.caption;
    const page = body.page || "Zawaago";
    const imageUrl = body.imageUrl || "";
    const withImage = body.withImage || false;
    if (!caption) return c.json({ error: "Caption empty" }, 400);
    const pageId = page === "InnoTech"? c.env.PAGE_ID_INNOTECH : c.env.PAGE_ID_ZAWAAGO;
    if (!pageId) return c.json({ error: "Page ID not set for " + page, hint: "Add PAGE_ID_" + page.toUpperCase() + " in Cloudflare Variables" }, 400);
    if (!c.env.FB_TOKEN) return c.json({ error: "FB_TOKEN not set" }, 400);

    // If image is data URL and withImage true, post as photo
    if (withImage && imageUrl && imageUrl.startsWith("data:")) {
      try {
        const base64Data = imageUrl.split(",")[1];
        const binary = atob(base64Data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "image/png" });
        const form = new FormData();
        form.append("message", caption);
        form.append("source", blob, "ai-image.png");
        form.append("access_token", c.env.FB_TOKEN);
        const fbRes = await fetch("https://graph.facebook.com/v21.0/" + pageId + "/photos", { method: "POST", body: form });
        const data: any = await fbRes.json();
        return c.json({...data, posted_as: "photo" });
      } catch (e: any) {
        return c.json({ error: "Photo upload failed", details: e.message, fallback: "try text only" }, 500);
      }
    } else {
      const fbRes = await fetch("https://graph.facebook.com/v21.0/" + pageId + "/feed", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ message: caption, access_token: c.env.FB_TOKEN })
      });
      const data: any = await fbRes.json();
      return c.json({...data, posted_as: "feed" });
    }
  } catch (err: any) {
    return c.json({ error: "Post exception", details: err.message }, 500);
  }
});

apiRoutes.get("/autoposter", (c) => {
  const html = '<!DOCTYPE html><html><head><title>Zawaago Autoposter - AI Agents</title><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"><style>.glass{backdrop-filter:blur(10px)}</style></head><body class="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 min-h-screen p-3 md:p-6 text-slate-100"><div class="max-w-6xl mx-auto"><div class="bg-white/10 glass p-4 rounded-2xl shadow-xl border border-white/20 mb-4 flex flex-wrap justify-between items-center gap-3"><div><h1 class="text-xl md:text-2xl font-bold"><i class="fas fa-robot text-cyan-400"></i> Zawaago Autoposter <span class="text-xs bg-cyan-500/20 px-2 py-1 rounded ml-2">AI Agents • Business Innovation</span></h1><p class="text-[11px] text-slate-300 mt-1">AI Agents, AI Apps, Business Consultant & Innovation Consultant content</p></div><div class="flex gap-2"><button onclick="checkHealth()" class="text-xs bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg border border-white/10">Health</button><a href="/api/autoposter/health" target="_blank" class="text-xs bg-white/10 px-3 py-2 rounded-lg">API</a></div></div><div class="bg-white text-slate-900 p-5 rounded-2xl shadow-xl mb-4"><div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"><div class="md:col-span-2"><label class="text-[11px] font-bold text-slate-500 uppercase">Page</label><select id="page" class="border border-slate-200 p-2.5 rounded-xl w-full font-semibold"><option>Zawaago</option><option>InnoTech</option></select></div><div class="md:col-span-3"><label class="text-[11px] font-bold text-slate-500 uppercase">Content Type</label><select id="contentType" class="border border-slate-200 p-2.5 rounded-xl w-full text-sm"><option>AI Agents & Automation</option><option>AI Apps & Tools</option><option>Business Consulting</option><option>Innovation Strategy</option><option>AI News & Insights</option><option>Founder Productivity</option><option>Case Study</option></select></div><div class="md:col-span-2"><label class="text-[11px] font-bold text-slate-500 uppercase">Tone</label><select id="tone" class="border border-slate-200 p-2.5 rounded-xl w-full text-sm"><option>Professional Hinglish</option><option>Professional English</option><option>Viral Hook</option><option>Storytelling</option><option>Technical Deep Dive</option></select></div><div class="md:col-span-5"><label class="text-[11px] font-bold text-slate-500 uppercase">Topic / Idea</label><div class="flex gap-2"><input id="topic" class="border border-slate-200 p-2.5 rounded-xl w-full text-sm" placeholder="e.g. How AI Agents close 3x more leads for coaches" value="How AI Agents save 20 hours/week for founders"><button id="genBtn" onclick="generate()" class="bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-600 hover:to-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold shadow">Generate</button></div></div></div><div id="progressWrap" class="hidden mt-4"><div class="flex justify-between text-[11px] text-slate-500 mb-1"><span id="progressText">Starting...</span><span id="progressPct">10%</span></div><div class="w-full bg-slate-100 rounded-full h-2.5"><div id="progressBar" class="bg-gradient-to-r from-cyan-500 to-indigo-600 h-2.5 rounded-full transition-all duration-500" style="width:10%"></div></div></div></div><div class="grid grid-cols-1 lg:grid-cols-2 gap-4"><div class="bg-white text-slate-900 p-5 rounded-2xl shadow-xl"><div class="flex justify-between items-center"><label class="text-sm font-bold">Caption</label><div class="flex gap-2 items-center"><span id="modelUsed" class="text-[10px] bg-slate-100 px-2 py-1 rounded-full"></span><span id="charCount" class="text-[10px] text-slate-400">0 chars</span></div></div><textarea id="caption" class="w-full h-[320px] border border-slate-200 p-3 mt-3 text-[13px] leading-relaxed rounded-xl focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="AI generated caption yahan ayega..."></textarea><div class="grid grid-cols-2 gap-2 mt-3"><button id="postBtn" onclick="postNow(false)" class="bg-slate-900 hover:bg-black text-white py-3 rounded-xl text-sm font-bold"><i class="fab fa-facebook"></i> Post Text</button><button id="postImgBtn" onclick="postNow(true)" class="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white py-3 rounded-xl text-sm font-bold"><i class="fas fa-image"></i> Post with Image</button></div><div class="grid grid-cols-2 gap-2 mt-2"><button onclick="copyCaption()" class="bg-slate-100 hover:bg-slate-200 py-2.5 rounded-xl text-sm font-semibold">Copy</button><button onclick="regenerate()" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2.5 rounded-xl text-sm font-semibold">Regenerate</button></div><div id="log" class="text-[11px] bg-slate-50 border border-slate-100 p-3 mt-3 rounded-xl break-all whitespace-pre-wrap max-h-48 overflow-auto font-mono">Ready to generate...</div></div><div class="bg-white text-slate-900 p-5 rounded-2xl shadow-xl"><div class="flex justify-between items-center"><label class="text-sm font-bold">AI Image</label><div class="flex gap-2"><button onclick="generateImageOnly()" class="text-[11px] bg-slate-900 text-white px-3 py-1.5 rounded-full">Regen Image</button><span id="imgBadge" class="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded-full hidden">AI Generated</span></div></div><div class="relative mt-3"><img id="img" class="w-full h-[320px] object-cover rounded-xl bg-slate-50 border border-slate-200"/><div id="imgLoader" class="hidden absolute inset-0 bg-white/80 flex items-center justify-center rounded-xl"><i class="fas fa-spinner fa-spin text-2xl text-indigo-600"></i></div></div><div class="mt-3"><label class="text-[11px] font-bold text-slate-500 uppercase">Custom Image Prompt (optional)</label><div class="flex gap-2 mt-1"><input id="imgPrompt" class="border border-slate-200 p-2.5 rounded-xl w-full text-xs" placeholder="e.g. minimal dashboard of AI agents working"><button onclick="generateImageOnly()" class="bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs">Go</button></div></div><div class="text-[11px] text-slate-400 mt-3 p-2 bg-slate-50 rounded-lg">Tip: Zawaago ke liye AI Agents, automation, founder productivity images best perform karte hain. Image ke saath post karne se reach 3x badhti hai.</div></div></div><div class="text-center text-[10px] text-white/40 mt-6">Zawaago • AI Business Consultant • Built on Cloudflare Workers AI • Models: llama-3.3-70b + flux-1-schnell</div></div><script>function setProgress(p,txt){document.getElementById("progressWrap").classList.remove("hidden");document.getElementById("progressBar").style.width=p+"%";document.getElementById("progressText").innerText=txt;document.getElementById("progressPct").innerText=p+"%";}function resetProgress(){setTimeout(function(){document.getElementById("progressWrap").classList.add("hidden");},2000);}async function checkHealth(){setProgress(20,"Checking health...");try{const r=await fetch("/api/autoposter/health");const d=await r.json();document.getElementById("log").innerText=JSON.stringify(d,null,2);document.getElementById("log").className="text-[11px] bg-green-50 border border-green-200 p-3 mt-3 rounded-xl break-all font-mono";setProgress(100,"Health OK - Token:"+d.has_token+" Zawaago:"+d.page_zawaago);resetProgress();}catch(e){document.getElementById("log").innerText="Health Error: "+e.message;setProgress(100,"Error");}}function updateChar(){const c=document.getElementById("caption").value;document.getElementById("charCount").innerText=c.length+" chars";}document.addEventListener("input",function(e){if(e.target.id==="caption") updateChar();});async function generate(){const topic=document.getElementById("topic").value;const page=document.getElementById("page").value;const contentType=document.getElementById("contentType").value;const tone=document.getElementById("tone").value;const btn=document.getElementById("genBtn");if(!topic){alert("Topic likho");return;}btn.disabled=true;btn.innerHTML="Generating...";setProgress(20,"Connecting Llama 3.3 70B...");document.getElementById("log").innerText="Generating for: "+topic+"\\nPage: "+page+"\\nType: "+contentType+"\\nTone: "+tone;document.getElementById("log").className="text-[11px] bg-blue-50 border border-blue-200 p-3 mt-3 rounded-xl font-mono";document.getElementById("imgLoader").classList.remove("hidden");try{setProgress(50,"Writing business consultant caption... 5-10 sec");const res=await fetch("/api/autoposter/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:topic,pageName:page,contentType:contentType,tone:tone})});setProgress(80,"Parsing + generating image...");const text=await res.text();let data;try{data=JSON.parse(text);}catch(e){data={error:"Invalid JSON",raw:text.slice(0,800)}}if(data.error){document.getElementById("log").innerText="ERROR: "+JSON.stringify(data,null,2);document.getElementById("log").className="text-[11px] bg-red-50 border border-red-200 text-red-700 p-3 mt-3 rounded-xl font-mono";setProgress(100,"Failed");}else{document.getElementById("caption").value=data.caption;updateChar();document.getElementById("img").src=data.imageUrl;document.getElementById("modelUsed").innerText=(data.usedModel||"").split("/").pop();document.getElementById("imgBadge").classList.toggle("hidden",!data.imageGenerated);document.getElementById("log").innerText="SUCCESS!\\nModel: "+(data.usedModel||"")+"\\nLength: "+data.caption.length+" chars\\nImage: "+(data.imageGenerated?"AI Flux":"Picsum fallback");document.getElementById("log").className="text-[11px] bg-green-50 border border-green-200 text-green-700 p-3 mt-3 rounded-xl font-mono";setProgress(100,"Done! Ready to Post");}}catch(e){document.getElementById("log").innerText="Network Error: "+e.message;document.getElementById("log").className="text-[11px] bg-red-50 p-3 mt-3 rounded-xl font-mono";setProgress(100,"Network Error");}finally{btn.disabled=false;btn.innerHTML="Generate";document.getElementById("imgLoader").classList.add("hidden");resetProgress();}}async function generateImageOnly(){const topic=document.getElementById("topic").value;const custom=document.getElementById("imgPrompt").value;const img=document.getElementById("img");document.getElementById("imgLoader").classList.remove("hidden");setProgress(30,"Generating AI image with Flux...");try{const res=await fetch("/api/autoposter/generate-image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:topic,imgPrompt:custom||("AI agents business illustration "+topic)})});const data=await res.json();if(data.imageUrl){img.src=data.imageUrl;document.getElementById("imgBadge").classList.remove("hidden");document.getElementById("log").innerText="Image regenerated! Ready to post with image.";setProgress(100,"Image Done");}else{document.getElementById("log").innerText="Image Error: "+JSON.stringify(data);setProgress(100,"Image Failed");}}catch(e){document.getElementById("log").innerText="Image Network Error: "+e.message;}finally{document.getElementById("imgLoader").classList.add("hidden");resetProgress();}}async function postNow(withImage){const caption=document.getElementById("caption").value;const page=document.getElementById("page").value;const imageUrl=document.getElementById("img").src;const btnId=withImage?"postImgBtn":"postBtn";const btn=document.getElementById(btnId);if(!caption){alert("Pehle Generate karo");return;}btn.disabled=true;const old=btn.innerHTML;btn.innerHTML="Posting...";setProgress(30,"Posting to "+page+(withImage?" with image":"")+"...");document.getElementById("log").innerText="Posting to Facebook Page: "+page+"...";try{const res=await fetch("/api/autoposter/post-now",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({caption:caption,page:page,imageUrl:imageUrl,withImage:withImage})});const data=await res.json();setProgress(100,"Facebook Response");document.getElementById("log").innerText=JSON.stringify(data,null,2);if(data.id||data.post_id){document.getElementById("log").className="text-[11px] bg-green-50 border border-green-200 text-green-700 p-3 mt-3 rounded-xl font-mono";alert("Posted Success! ID: "+(data.id||data.post_id));}else{document.getElementById("log").className="text-[11px] bg-red-50 border border-red-200 text-red-700 p-3 mt-3 rounded-xl font-mono";if(data.error&&data.error.message&&data.error.message.includes("permission")) alert("Permission error - FB_TOKEN me pages_manage_posts permission add karo");}}catch(e){document.getElementById("log").innerText="Post Error: "+e.message;setProgress(100,"Error");}finally{btn.disabled=false;btn.innerHTML=old;resetProgress();}}function copyCaption(){const c=document.getElementById("caption").value;if(!c){alert("Nothing to copy");return;}navigator.clipboard.writeText(c);document.getElementById("log").innerText="Copied to clipboard!";}function regenerate(){generate();}window.onload=checkHealth;</script></body></html>';
  return c.html(html);
});