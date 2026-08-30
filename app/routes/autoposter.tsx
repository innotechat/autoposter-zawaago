import { useState } from "react"

export default function Autoposter() {
  const [topic, setTopic] = useState("AI se travel planning")
  const [page, setPage] = useState("Zawaago")
  const [caption, setCaption] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [log, setLog] = useState("")

  const generate = async () => {
    if (!topic.trim()) return alert("Topic likho")
    setLoading(true)
    setLog("Generating caption with Llama 3.1...")
    try {
      const res = await fetch("/api/autoposter/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, pageName: page }),
      })
      const data = await res.json()
      if (data.caption) {
        setCaption(data.caption)
        setImageUrl(data.imageUrl)
        setLog("✅ Caption ready")
      } else {
        setLog("❌ Failed: " + JSON.stringify(data))
      }
    } catch (e: any) {
      setLog("❌ Error: " + e.message)
    }
    setLoading(false)
  }

  const postNow = async () => {
    if (!caption.trim()) return alert("Pehle Generate karo")
    setPosting(true)
    setLog("Posting to Facebook...")
    try {
      const res = await fetch("/api/autoposter/post-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, page }),
      })
      const data = await res.json()
      if (data.id) {
        setLog(`✅ Posted! Post ID: ${data.id}`)
      } else {
        setLog("❌ FB Error: " + JSON.stringify(data))
      }
    } catch (e: any) {
      setLog("❌ Error: " + e.message)
    }
    setPosting(false)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Autoposter - Zawaago + InnoTech</h1>
        <p className="text-sm text-gray-500 mt-1">Workers AI (Llama 3.1) se Hindi caption → Direct FB Page Post</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <label className="text-sm font-medium">Page Select</label>
          <select value={page} onChange={e => setPage(e.target.value)} className="mt-2 w-full border rounded px-3 py-2">
            <option>Zawaago</option>
            <option>InnoTech</option>
          </select>
        </div>
        <div className="bg-white border rounded-lg p-4 md:col-span-2">
          <label className="text-sm font-medium">Topic</label>
          <div className="flex gap-2 mt-2">
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Ex: AI se Goa trip kaise plan kare" className="flex-1 border rounded px-3 py-2" />
            <button onClick={generate} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded disabled:opacity-50">
              {loading ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border rounded-lg p-4">
          <label className="text-sm font-medium">Generated Caption</label>
          <textarea value={caption} onChange={e => setCaption(e.target.value)} className="mt-2 w-full h-64 border rounded p-3 text-sm" placeholder="Yaha caption aayega..." />
          <button onClick={postNow} disabled={posting} className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded disabled:opacity-50">
            {posting ? "Posting..." : `Post Now to ${page}`}
          </button>
          {log && <div className="mt-3 text-xs bg-gray-50 border p-2 rounded break-all">{log}</div>}
        </div>
        <div className="bg-white border rounded-lg p-4">
          <label className="text-sm font-medium">Image Preview</label>
          <div className="mt-2 border rounded h-64 flex items-center justify-center bg-gray-50 overflow-hidden">
            {imageUrl ? <img src={imageUrl} alt="preview" className="w-full h-full object-cover" /> : <span className="text-sm text-gray-400">No image</span>}
          </div>
          <p className="text-xs text-gray-400 mt-2">Unsplash placeholder - baad me Flux se generate karenge</p>
        </div>
      </div>

      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded p-3 text-xs">
        <b>Note:</b> has_token:false dikh raha tha — Cloudflare Worker → Settings → Variables → Add Secret: <code>FB_TOKEN</code> , Add Variable: <code>PAGE_ID_ZAWAAGO</code> , <code>PAGE_ID_INNOTECH</code> add karo, fir Post Now kaam karega.
      </div>
    </div>
  )
}