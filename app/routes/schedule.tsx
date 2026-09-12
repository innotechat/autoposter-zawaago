import { useEffect, useState } from "react";
import { ArrowLeft, CalendarCheck, Clock, Trash } from "@phosphor-icons/react";

type Schedule = { id: string; pageName: "Zawaago" | "InnoTech"; caption: string; imageUrl?: string; withImage: boolean; scheduledAt: string; status: string; };

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

  async function load() {
    const res = await fetch("/api/autoposter/schedules");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSchedules(data.schedules || []); else setMessage(errorText(data));
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(data));
      setCaption(""); setImageUrl(""); setWithImage(false); setScheduledAt(""); setMessage(`Scheduled for ${new Date(data.schedule.scheduledAt).toLocaleString()}.`); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  }

  async function cancel(id: string) {
    if (!confirm("Cancel this scheduled post?")) return;
    const res = await fetch(`/api/autoposter/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(errorText(data)); else { setMessage("Scheduled post cancelled."); await load(); }
  }

  return <main className="autoposter-shell min-h-screen text-[#171717]"><div className="mx-auto w-full max-w-[1100px] px-4 py-5 sm:px-6 lg:py-8">
    <div className="mb-6 flex items-center justify-between gap-3"><a href="/" className="icon-button"><ArrowLeft size={18}/> Studio</a><div className="text-right"><h1 className="text-2xl font-semibold tracking-[-0.03em]">Schedule posts</h1><p className="text-sm text-[#777]">Automatic Facebook publishing · checked every minute</p></div></div>
    <section className="premium-card p-5 sm:p-7"><div className="mb-5 flex items-center gap-3"><div className="brand-mark"><CalendarCheck size={22}/></div><div><h2 className="text-lg font-semibold">Create scheduled post</h2><p className="text-sm text-[#777]">Review the final caption and image before scheduling.</p></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="field-label">Facebook Page</span><select className="field-control" value={page} onChange={e => setPage(e.target.value as any)}><option>Zawaago</option><option>InnoTech</option></select></label><label className="block"><span className="field-label">Date & time</span><input className="field-control" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} /></label></div>
      <label className="mt-4 block"><span className="field-label">Caption</span><textarea className="field-control min-h-[180px]" value={caption} onChange={e => setCaption(e.target.value)} placeholder="Write or paste the final Facebook caption…" /></label>
      <div className="mt-4 rounded-2xl border border-black/10 bg-black/[0.02] p-4"><label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={withImage} onChange={e => setWithImage(e.target.checked)} /> Publish with image</label>{withImage && <input className="field-control mt-3" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Final R2 image URL" />}</div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><button className="primary-button" onClick={createSchedule} disabled={busy}>{busy ? "Scheduling…" : "Schedule post"}</button><a href="/history" className="icon-button">Publishing history</a>{message && <span className="text-sm text-[#666]">{message}</span>}</div>
    </section>
    <section className="mt-6 premium-card p-5 sm:p-7"><div className="mb-4 flex items-center gap-2"><Clock size={19}/><h2 className="text-lg font-semibold">Upcoming & recent schedules</h2></div>{schedules.length === 0 ? <p className="text-sm text-[#777]">No scheduled posts yet.</p> : <div className="space-y-3">{schedules.map(item => <article key={item.id} className="rounded-2xl border border-black/10 p-4"><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span>{item.pageName}</span><span className="status-pill">{item.status}</span></div><p className="mt-1 text-sm text-[#555]">{new Date(item.scheduledAt).toLocaleString()}</p><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm">{item.caption}</p></div>{item.status === "scheduled" && <button className="icon-button" title="Cancel" onClick={() => cancel(item.id)}><Trash size={18}/></button>}</div></article>)}</div>}</section>
  </div></main>;
}
