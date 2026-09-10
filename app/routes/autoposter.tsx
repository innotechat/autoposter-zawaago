import { useState } from "react";

export default function Autoposter() {
  const [page, setPage] = useState("Zawaago");
  const [topic, setTopic] = useState("How AI Agents save time for business owners");
  const [contentType, setContentType] = useState("AI Agents & Automation");
  const [tone, setTone] = useState("Professional Hinglish");
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [health, setHealth] = useState<any>(null);

  async function generate() {
    setBusy(true); setStatus("Generating content...");
    try {
      const res = await fetch("/api/autoposter/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageName: page, topic, contentType, tone }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Generation failed");
      setCaption(data.caption || ""); setImageUrl(data.imageUrl || ""); setStatus(`Generated with ${data.usedModel || "AI"}`);
    } catch (e: any) { setStatus(e.message); }
    finally { setBusy(false); }
  }

  async function postNow(withImage = false) {
    if (!caption.trim()) return setStatus("Generate or enter a caption first.");
    setBusy(true); setStatus(withImage ? "Posting image..." : "Posting text...");
    try {
      const res = await fetch("/api/autoposter/post-now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page, caption, imageUrl, withImage }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.details || data.error || "Facebook post failed");
      setStatus(`Published successfully: ${data.id || "Facebook accepted the post"}`);
    } catch (e: any) { setStatus(e.message); }
    finally { setBusy(false); }
  }

  async function checkHealth() {
    try { const res = await fetch("/api/autoposter/health"); setHealth(await res.json()); }
    catch (e: any) { setStatus(e.message); }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><div className="text-sm text-cyan-400 font-semibold">ZAWAAGO</div><h1 className="text-3xl font-bold">AI Autoposter</h1><p className="text-neutral-400 mt-1">Create, preview and publish social content.</p></div>
          <button onClick={checkHealth} className="px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700">System Health</button>
        </header>

        <section className="grid md:grid-cols-2 gap-5">
          <div className="bg-white text-neutral-900 rounded-2xl p-5 shadow-xl">
            <h2 className="font-bold text-lg mb-4">Create Post</h2>
            <label className="block text-sm font-semibold mb-1">Page</label>
            <select value={page} onChange={e => setPage(e.target.value)} className="w-full border rounded-lg p-2.5 mb-3"><option>Zawaago</option><option>InnoTech</option></select>
            <label className="block text-sm font-semibold mb-1">Content Type</label>
            <select value={contentType} onChange={e => setContentType(e.target.value)} className="w-full border rounded-lg p-2.5 mb-3"><option>AI Agents & Automation</option><option>AI Apps & Tools</option><option>Business Consulting</option><option>Innovation Strategy</option><option>AI News & Insights</option><option>Founder Productivity</option><option>Case Study</option></select>
            <label className="block text-sm font-semibold mb-1">Tone</label>
            <select value={tone} onChange={e => setTone(e.target.value)} className="w-full border rounded-lg p-2.5 mb-3"><option>Professional Hinglish</option><option>Professional English</option><option>Viral Hook</option><option>Storytelling</option><option>Technical Deep Dive</option></select>
            <label className="block text-sm font-semibold mb-1">Topic</label>
            <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={4} className="w-full border rounded-lg p-2.5 mb-4" />
            <button disabled={busy} onClick={generate} className="w-full py-3 rounded-lg bg-neutral-900 text-white font-semibold disabled:opacity-50">{busy ? "Working..." : "Generate AI Post"}</button>
          </div>

          <div className="bg-white text-neutral-900 rounded-2xl p-5 shadow-xl">
            <h2 className="font-bold text-lg mb-4">Preview & Publish</h2>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={11} placeholder="Generated caption appears here..." className="w-full border rounded-lg p-3 mb-3" />
            {imageUrl && <img src={imageUrl} alt="Generated post visual" className="w-full max-h-72 object-cover rounded-lg mb-3" />}
            <div className="grid grid-cols-2 gap-2">
              <button disabled={busy || !caption} onClick={() => postNow(false)} className="py-2.5 rounded-lg bg-neutral-900 text-white disabled:opacity-40">Post Text</button>
              <button disabled={busy || !caption || !imageUrl} onClick={() => postNow(true)} className="py-2.5 rounded-lg border border-neutral-300 disabled:opacity-40">Post Image</button>
            </div>
          </div>
        </section>

        {status && <div className="mt-5 rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-sm">{status}</div>}
        {health && <pre className="mt-4 rounded-lg bg-neutral-900 border border-neutral-800 p-4 text-xs overflow-auto">{JSON.stringify(health, null, 2)}</pre>}
      </div>
    </main>
  );
}
