import { useEffect, useState } from "react";
import { ArrowLeft, CalendarCheck, CheckCircle, Clock, Trash, WarningCircle } from "@phosphor-icons/react";

type Schedule = { id: string; pageName: "Zawaago" | "InnoTech"; caption: string; imageUrl?: string; withImage: boolean; scheduledAt: string; status: "scheduled" | "processing" | "published" | "failed" | "cancelled"; error?: string; facebookPostId?: string; };

function errorText(data: any) { return data?.details || data?.error || "Something went wrong."; }

export default function SchedulePage() {
  const [page, setPage] = useState<"Zawaago" | "InnoTech">("Zawaago");
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [withImage, setWithImage] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"all" | "queued" | "published" | "failed">("all");

  async function load() {
    try {
      const res = await fetch("/api/autoposter/schedules");
      const data: any = await res.json().catch(() => ({}));
      if (res.ok) setSchedules(data.schedules || []); else setMessage(errorText(data));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load schedules."); }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem("autoposter:schedule-draft");
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.page === "InnoTech") setPage("InnoTech");
        if (draft.caption) setCaption(String(draft.caption));
        if (draft.imageUrl) { setImageUrl(String(draft.imageUrl)); setWithImage(true); }
        localStorage.removeItem("autoposter:schedule-draft");
      }
    } catch { /* ignore invalid local draft */ }
    void load();
  }, []);

  async function createSchedule() {
    if (!caption.trim() || !scheduledAt) return setMessage("Add a caption and schedule date/time.");
    if (withImage && !imageUrl.trim()) return setMessage("Add the final image URL for an image post.");
    setBusy(true); setMessage("Scheduling…");
    try {
      const res = await fetch("/api/autoposter/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page, caption, imageUrl, withImage, scheduledAt: new Date(scheduledAt).toISOString() }) });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(data));
      setCaption(""); setImageUrl(""); setWithImage(false); setScheduledAt(""); setMessage(`Scheduled for ${new Date(data.schedule.scheduledAt).toLocaleString()}.`); await load(); setView("queued");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  }

  async function cancel(id: string) {
    if (!confirm("Cancel this scheduled post?")) return;
    const res = await fetch(`/api/autoposter/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(errorText(data)); else { setMessage("Scheduled post cancelled."); await load(); }
  }

  const visible = schedules.filter((item) => view === "all" || (view === "queued" ? item.status === "scheduled" || item.status === "processing" : item.status === view));
  const queuedCount = schedules.filter((item) => item.status === "scheduled" || item.status === "processing").length;
  const publishedCount = schedules.filter((item) => item.status === "published").length;
  const failedCount = schedules.filter((item) => item.status === "failed").length;

  return <main className="autoposter-shell min-h-screen text-[#171717]"><div className="mx-auto w-full max-w-[1100px] px-4 py-5 sm:px-6 lg:py-8">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><a href="/" className="icon-button"><ArrowLeft size={18}/> Studio</a><a href="/history" className="icon-button">Publishing history</a></div><div className="text-right"><h1 className="text-2xl font-semibold tracking-[-0.03em]">Schedule & queue</h1><p className="text-sm text-[#777]">Queued posts publish automatically every minute.</p></div></div>
    <section className="premium-card p-5 sm:p-7"><div className="mb-5 flex items-center gap-3"><div className="brand-mark"><CalendarCheck size={22}/></div><div><h2 className="text-lg font-semibold">Create scheduled post</h2><p className="text-sm text-[#777]">Review the final caption and image before scheduling.</p></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="field-label">Facebook Page</span><select className="field-control" value={page} onChange={e => setPage(e.target.value as any)}><option>Zawaago</option><option>InnoTech</option></select></label><label className="block"><span className="field-label">Date & time</span><input className="field-control" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} /></label></div>
      <label className="mt-4 block"><span className="field-label">Caption</span><textarea className="field-control min-h-[180px]" value={caption} onChange={e => setCaption(e.target.value)} placeholder="Write or paste the final Facebook caption…" /></label>
      <div className="mt-4 rounded-2xl border border-black/10 bg-black/[0.02] p-4"><label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={withImage} onChange={e => setWithImage(e.target.checked)} /> Publish with image</label>{withImage && <input className="field-control mt-3" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Final R2 image URL" />}</div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><button className="primary-button" onClick={createSchedule} disabled={busy}>{busy ? "Scheduling…" : "Schedule post"}</button><button className="icon-button" onClick={() => void load()}>Refresh queue</button>{message && <span className="text-sm text-[#666]">{message}</span>}</div>
    </section>
    <section className="mt-6 premium-card p-5 sm:p-7"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Clock size={19}/><h2 className="text-lg font-semibold">Scheduled posts</h2></div><div className="flex gap-1 rounded-xl border border-black/10 bg-white p-1">{([["all", "All"], ["queued", `Queued ${queuedCount}`], ["published", `Published ${publishedCount}`], ["failed", `Failed ${failedCount}`]] as const).map(([key, label]) => <button key={key} onClick={() => setView(key)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === key ? "bg-[#171717] text-white" : "text-black/55"}`}>{label}</button>)}</div></div>{visible.length === 0 ? <p className="py-12 text-center text-sm text-[#777]">No posts in this view. The queue is loaded automatically when this page opens.</p> : <div className="space-y-3">{visible.map(item => <article key={item.id} className="rounded-2xl border border-black/10 bg-white p-4"><div className="flex items-start gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span>{item.pageName}</span><span className="status-pill">{item.status}</span>{item.withImage && <span className="text-xs text-black/45">Image post</span>}</div><p className="mt-1 text-sm text-[#555]">{new Date(item.scheduledAt).toLocaleString()}</p><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm">{item.caption}</p>{item.error && <p className="mt-2 text-xs text-black/55">Error: {item.error}</p>}{item.facebookPostId && <p className="mt-2 text-xs text-black/45">Facebook ID: {item.facebookPostId}</p>}</div>{item.imageUrl && <img src={item.imageUrl} alt="Scheduled creative" className="h-24 w-24 shrink-0 rounded-xl object-cover" />}{item.status === "scheduled" && <button className="icon-button" title="Cancel" onClick={() => cancel(item.id)}><Trash size={18}/></button>}</div></article>)}</div>}</section>
    <div className="mt-4 flex items-center gap-2 text-xs text-black/45"><CheckCircle size={15} /> Scheduled records stay in the queue after publishing, so you can see the original schedule, final image, Facebook result or failure here.</div>
  </div></main>;
}
