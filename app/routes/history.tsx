import { useEffect, useState } from "react";
import { ArrowClockwise, CheckCircle, ClockCounterClockwise, Trash, WarningCircle } from "@phosphor-icons/react";

type RecordItem = {
  id: string;
  pageName: "Zawaago" | "InnoTech";
  pageId: string;
  contentType: "text" | "image" | "reel";
  caption: string;
  imageUrl?: string;
  facebookPostId?: string;
  status: "published" | "failed";
  createdAt: string;
  error?: string;
};

type ApiResponse = { ok: boolean; records: RecordItem[]; error?: string };

export default function History() {
  const [brand, setBrand] = useState<"All" | "Zawaago" | "InnoTech">("All");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const query = brand === "All" ? "" : `?brand=${encodeURIComponent(brand)}`;
      const res = await fetch(`/api/history${query}`);
      const data: ApiResponse = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Unable to load history.");
      setRecords(data.records || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load history."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [brand]);

  async function remove(record: RecordItem) {
    if (!window.confirm("Delete this history record?")) return;
    const res = await fetch(`/api/history/${encodeURIComponent(record.id)}?brand=${encodeURIComponent(record.pageName)}`, { method: "DELETE" });
    if (res.ok) setRecords((current) => current.filter((item) => item.id !== record.id));
    else setError("The history record could not be deleted.");
  }

  return <main className="autoposter-shell min-h-screen text-[#171717]"><div className="mx-auto w-full max-w-[1380px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
    <header className="studio-header"><div className="flex items-center gap-3"><div className="brand-mark">Z</div><div><h1 className="text-[20px] font-semibold">Publishing History</h1><p className="text-[12px] text-[#777]">Published and failed Facebook posts, persisted in Cloudflare R2.</p></div></div><div className="flex gap-2"><a className="icon-button" href="/">Studio</a><button className="icon-button" onClick={() => void load()} disabled={loading}><ArrowClockwise className={loading ? "animate-spin" : ""} size={18} /> <span className="hidden sm:inline">Refresh</span></button></div></header>
    <section className="panel mt-5"><div className="panel-heading"><div><span className="section-number">01</span><h3>Post history</h3></div><div className="flex gap-1 rounded-xl border border-black/10 bg-white p-1">{["All", "Zawaago", "InnoTech"].map((item) => <button key={item} onClick={() => setBrand(item as typeof brand)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${brand === item ? "bg-[#171717] text-white" : "text-black/55"}`}>{item}</button>)}</div></div>
      {error && <div className="status-banner error"><WarningCircle size={18} /><span>{error}</span></div>}
      {loading ? <div className="py-16 text-center text-sm text-black/45">Loading publishing history…</div> : records.length === 0 ? <div className="py-16 text-center"><ClockCounterClockwise size={40} className="mx-auto mb-3 text-black/25" /><strong>No publishing history yet</strong><p className="mt-1 text-sm text-black/45">Your next Facebook publish will appear here.</p></div> : <div className="space-y-3">{records.map((record) => <article key={record.id} className="rounded-2xl border border-black/8 bg-white p-4"><div className="flex flex-col gap-4 md:flex-row"><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2"><span className="page-avatar">{record.pageName === "Zawaago" ? "Z" : "I"}</span><strong>{record.pageName}</strong><span className="text-xs text-black/40">{record.contentType === "image" ? "Image post" : record.contentType === "reel" ? "Reel" : "Text post"}</span><span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${record.status === "published" ? "bg-black/5" : "bg-black/8"}`}>{record.status === "published" ? <CheckCircle size={14} weight="fill" /> : <WarningCircle size={14} weight="fill" />}{record.status}</span></div><p className="whitespace-pre-wrap text-sm leading-6 text-black/75">{record.caption}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/40"><span>{new Date(record.createdAt).toLocaleString()}</span>{record.facebookPostId && <span>Facebook ID: {record.facebookPostId}</span>}{record.error && <span>Reason: {record.error}</span>}</div></div>{record.imageUrl && record.contentType === "reel" ? <video src={record.imageUrl} controls playsInline className="h-28 w-28 shrink-0 rounded-xl object-cover" /> : record.imageUrl ? <img src={record.imageUrl} alt="Published creative" className="h-28 w-28 shrink-0 rounded-xl object-cover" /> : null}<button className="icon-button small self-start" title="Delete record" onClick={() => void remove(record)}><Trash size={17} /></button></div></article>)}</div>}
    </section>
  </div></main>;
}
