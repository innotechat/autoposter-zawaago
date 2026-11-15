import { useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise,
  ArrowLeft,
  CalendarCheck,
  CheckCircle,
  Clock,
  FilmStrip,
  PencilSimple,
  Play,
  SpinnerGap,
  Trash,
  WarningCircle,
  X
} from "@phosphor-icons/react";
import { resolveAssetUrl } from "../lib/asset-url";

type BrandName = "Zawaago" | "InnoTech";

type Schedule = {
  id: string;
  contentPlanId?: string;
  pageName: BrandName;
  pageId?: string;
  caption: string;
  title?: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaType?: "image" | "video";
  withImage: boolean;
  scheduledAt: string;
  status: "scheduled" | "processing" | "published" | "failed" | "cancelled";
  retryCount?: number;
  nextRetryAt?: string;
  createdAt?: string;
  publishedAt?: string;
  facebookPostId?: string;
  error?: string;
};

type BannerState = { tone: "success" | "error" | "info"; text: string } | null;

function errorText(data: any) {
  return data?.details || data?.error || "Something went wrong.";
}

function formatLocal(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatIst(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }) + " IST"
  );
}

function toLocalDatetimeInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function SchedulePage() {
  const [page, setPage] = useState<BrandName>("Zawaago");
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [withImage, setWithImage] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [previewBroken, setPreviewBroken] = useState(false);

  const [reelPage, setReelPage] = useState<BrandName>("Zawaago");
  const [reelCaption, setReelCaption] = useState("");
  const [reelTitle, setReelTitle] = useState("");
  const [reelVideoUrl, setReelVideoUrl] = useState("");
  const [reelScheduledAt, setReelScheduledAt] = useState("");

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState>(null);

  const [view, setView] = useState<"all" | "queued" | "retrying" | "published" | "failed">("all");
  const [brandFilter, setBrandFilter] = useState<"All" | BrandName>("All");
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [brokenMediaIds, setBrokenMediaIds] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/autoposter/schedules");
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) {
        setSchedules(data.schedules || []);
      } else {
        setBanner({ tone: "error", text: errorText(data) });
      }
    } catch (error) {
      setBanner({ tone: "error", text: error instanceof Error ? error.message : "Unable to load schedules." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem("autoposter:schedule-draft");
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.page === "InnoTech") setPage("InnoTech");
        if (draft.caption) setCaption(String(draft.caption));
        if (draft.imageUrl) {
          setImageUrl(String(draft.imageUrl));
          setWithImage(true);
        }
        localStorage.removeItem("autoposter:schedule-draft");
      }
    } catch {
      /* ignore invalid local draft */
    }
    void load();
  }, []);

  useEffect(() => {
    setPreviewBroken(false);
  }, [imageUrl, withImage]);

  async function createSchedule() {
    if (!caption.trim() || !scheduledAt) {
      setBanner({ tone: "error", text: "Add a caption and schedule date/time." });
      return;
    }
    if (withImage && !imageUrl.trim()) {
      setBanner({ tone: "error", text: "Add the final R2 image URL for an image post." });
      return;
    }
    setBusy("post");
    setBanner({ tone: "info", text: "Scheduling post…" });
    try {
      const res = await fetch("/api/autoposter/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page,
          caption,
          imageUrl: withImage ? imageUrl : "",
          withImage,
          scheduledAt: new Date(scheduledAt).toISOString()
        })
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(data));
      setCaption("");
      setImageUrl("");
      setWithImage(false);
      setScheduledAt("");
      setBanner({ tone: "success", text: `Post scheduled for ${formatIst(data.schedule.scheduledAt)}.` });
      await load();
      setView("queued");
    } catch (error) {
      setBanner({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function createReelSchedule() {
    if (!reelCaption.trim() || !reelVideoUrl.trim() || !reelScheduledAt) {
      setBanner({ tone: "error", text: "Add Reel caption, MP4 R2 URL, and schedule date/time." });
      return;
    }
    setBusy("reel");
    setBanner({ tone: "info", text: "Scheduling Reel…" });
    try {
      const res = await fetch("/api/autoposter/schedules/reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: reelPage,
          caption: reelCaption,
          title: reelTitle,
          videoUrl: reelVideoUrl,
          scheduledAt: new Date(reelScheduledAt).toISOString()
        })
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(data));
      setReelCaption("");
      setReelTitle("");
      setReelVideoUrl("");
      setReelScheduledAt("");
      setBanner({ tone: "success", text: `Reel scheduled for ${formatIst(data.schedule.scheduledAt)}.` });
      await load();
      setView("queued");
    } catch (error) {
      setBanner({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function processDueNow() {
    setBusy("process-due");
    setBanner({ tone: "info", text: "Checking due schedules and publishing ready items…" });
    try {
      const res = await fetch("/api/autoposter/schedules/process-due", { method: "POST" });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(data));
      const summary = `Processed ${data.processed || 0}: ${data.published || 0} published, ${data.retrying || 0} retrying, ${data.failed || 0} failed.`;
      setBanner({
        tone: data.failed > 0 ? "error" : data.published > 0 ? "success" : "info",
        text: data.processed === 0 ? "No due items ready to publish right now." : summary
      });
      await load();
    } catch (error) {
      setBanner({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function retryItem(id: string) {
    setBusy(`retry:${id}`);
    setBanner({ tone: "info", text: "Retrying scheduled publish…" });
    try {
      const res = await fetch(`/api/autoposter/schedules/${encodeURIComponent(id)}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runNow: true })
      });
      const data: any = await res.json().catch(() => ({}));
      if (data.alreadyPublished) {
        setBanner({ tone: "success", text: "Item was already published to Facebook and has been synced." });
        await load();
        return;
      }
      if (!res.ok) throw new Error(errorText(data));
      setBanner({
        tone: data.outcome === "published" ? "success" : "info",
        text:
          data.outcome === "published"
            ? `Published to Facebook (ID: ${data.schedule?.facebookPostId || "ok"}).`
            : "Item queued for retry backoff."
      });
      await load();
    } catch (error) {
      setBanner({ tone: "error", text: error instanceof Error ? error.message : String(error) });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function saveReschedule(id: string) {
    if (!rescheduleValue) {
      setBanner({ tone: "error", text: "Choose a future date and time to reschedule." });
      return;
    }
    setBusy(`reschedule:${id}`);
    try {
      const res = await fetch(`/api/autoposter/schedules/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: new Date(rescheduleValue).toISOString() })
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(data));
      setRescheduleId(null);
      setRescheduleValue("");
      setBanner({ tone: "success", text: `Rescheduled for ${formatIst(data.schedule.scheduledAt)}.` });
      await load();
    } catch (error) {
      setBanner({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  async function cancelItem(id: string) {
    setBusy(`cancel:${id}`);
    try {
      const res = await fetch(`/api/autoposter/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorText(data));
      setConfirmCancelId(null);
      setBanner({ tone: "info", text: "Scheduled item cancelled." });
      await load();
    } catch (error) {
      setBanner({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  const brandScoped = useMemo(
    () => (brandFilter === "All" ? schedules : schedules.filter((item) => item.pageName === brandFilter)),
    [schedules, brandFilter]
  );

  const counts = useMemo(() => {
    const queued = brandScoped.filter((i) => (i.status === "scheduled" && !(i.retryCount && i.retryCount > 0)) || i.status === "processing").length;
    const retrying = brandScoped.filter((i) => i.status === "scheduled" && Boolean(i.retryCount && i.retryCount > 0)).length;
    const published = brandScoped.filter((i) => i.status === "published").length;
    const failed = brandScoped.filter((i) => i.status === "failed").length;
    return { all: brandScoped.length, queued: queued + retrying, retrying, published, failed };
  }, [brandScoped]);

  const visible = useMemo(() => {
    const filtered = brandScoped.filter((item) => {
      if (view === "all") return true;
      if (view === "queued") return item.status === "scheduled" || item.status === "processing";
      if (view === "retrying") return item.status === "scheduled" && Boolean(item.retryCount && item.retryCount > 0);
      return item.status === view;
    });

    const isPending = (s: Schedule["status"]) => s === "scheduled" || s === "processing";

    return [...filtered].sort((a, b) => {
      if (view === "published" || view === "failed") {
        const aTime = a.publishedAt || a.scheduledAt;
        const bTime = b.publishedAt || b.scheduledAt;
        return bTime.localeCompare(aTime);
      }
      if (view === "queued" || view === "retrying") {
        return a.scheduledAt.localeCompare(b.scheduledAt);
      }
      const aPend = isPending(a.status);
      const bPend = isPending(b.status);
      if (aPend !== bPend) return aPend ? -1 : 1;
      if (aPend) return a.scheduledAt.localeCompare(b.scheduledAt);
      const aTime = a.publishedAt || a.scheduledAt;
      const bTime = b.publishedAt || b.scheduledAt;
      return bTime.localeCompare(aTime);
    });
  }, [brandScoped, view]);

  const livePostImagePreview = withImage && imageUrl.trim() ? resolveAssetUrl(imageUrl.trim()) : "";
  const liveReelVideoPreview =
    reelVideoUrl.trim() && reelVideoUrl.trim().includes("/api/autoposter/assets/")
      ? resolveAssetUrl(reelVideoUrl.trim())
      : "";

  return (
    <main className="autoposter-shell min-h-screen text-[#171717]">
      <div className="mx-auto w-full max-w-[1380px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        {/* Header aligned with Studio / Content Brain OS */}
        <header className="studio-header flex-wrap">
          <div className="flex items-center gap-3">
            <div className="brand-mark">Z</div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="m-0 text-[20px] font-semibold tracking-[-0.03em]">Schedule & Queue</h1>
                <span className="status-pill">
                  <span className="live-dot" />
                  Cron Active
                </span>
              </div>
              <p className="m-0 text-[12px] text-[#777]">
                Manual schedules & Content Brain OS queued posts/Reels for Zawaago and InnoTech.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a href="/" className="icon-button text-[11px] no-underline">
              <ArrowLeft size={15} />
              <span>Main Studio</span>
            </a>
            <a href="/content-engine" className="icon-button text-[11px] no-underline">
              <span>Content Brain OS</span>
            </a>
            <a href="/reels" className="icon-button text-[11px] no-underline">
              <span>Reel Studio</span>
            </a>
            <a href="/history" className="icon-button text-[11px] no-underline">
              <span>History</span>
            </a>
            <button
              type="button"
              className="icon-button text-[11px]"
              onClick={() => void processDueNow()}
              disabled={busy === "process-due"}
              title="Run scheduler check for due posts/Reels now"
            >
              {busy === "process-due" ? (
                <SpinnerGap size={15} className="animate-spin" />
              ) : (
                <Play size={14} weight="fill" />
              )}
              <span>Process Due Now</span>
            </button>
            <button
              type="button"
              className="icon-button text-[11px]"
              onClick={() => void load()}
              disabled={loading}
            >
              <ArrowClockwise size={15} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </header>

        {banner && (
          <div className={`status-banner ${banner.tone}`}>
            {banner.tone === "error" ? (
              <WarningCircle size={18} weight="fill" />
            ) : banner.tone === "success" ? (
              <CheckCircle size={18} weight="fill" />
            ) : (
              <Clock size={18} />
            )}
            <span>{banner.text}</span>
            <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        )}

        {/* Composer Forms Grid */}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {/* Create Scheduled Post */}
          <section className="panel composer-panel">
            <div className="panel-heading">
              <div>
                <span className="section-number">01</span>
                <h3>Create scheduled post</h3>
              </div>
              <CalendarCheck size={18} className="text-[#888782]" />
            </div>

            <div className="field-group field-grid">
              <div>
                <label htmlFor="sched-post-page">Facebook Page</label>
                <select
                  id="sched-post-page"
                  value={page}
                  onChange={(e) => setPage(e.target.value as BrandName)}
                >
                  <option value="Zawaago">Zawaago</option>
                  <option value="InnoTech">InnoTech</option>
                </select>
              </div>
              <div>
                <label htmlFor="sched-post-time">Date & time (local)</label>
                <input
                  id="sched-post-time"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
            </div>
            {scheduledAt && !Number.isNaN(new Date(scheduledAt).getTime()) && (
              <p className="mt-1.5 text-[11px] text-[#777]">
                Target slot: <strong>{formatIst(new Date(scheduledAt).toISOString())}</strong>
              </p>
            )}

            <div className="field-group">
              <div className="flex items-center justify-between">
                <label htmlFor="sched-post-caption">Caption</label>
                <span className="field-hint">{caption.length} chars</span>
              </div>
              <textarea
                id="sched-post-caption"
                className="min-h-[150px]"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write or paste the final Facebook caption…"
              />
            </div>

            <div className="mt-4 rounded-xl border border-[#deddd9] bg-[#fafaf9] p-3.5">
              <label className="flex cursor-pointer items-center gap-2.5 text-xs font-semibold text-[#272727]">
                <input
                  type="checkbox"
                  checked={withImage}
                  onChange={(e) => setWithImage(e.target.checked)}
                />
                Publish with R2 image
              </label>
              {withImage && (
                <div className="field-group mt-3">
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="/api/autoposter/assets/generated/..."
                  />
                  {livePostImagePreview && (
                    <div className="mt-3 flex items-center gap-3 rounded-xl border border-black/8 bg-white p-2.5">
                      {!previewBroken ? (
                        <img
                          src={livePostImagePreview}
                          alt="Scheduled asset preview"
                          onError={() => setPreviewBroken(true)}
                          className="h-16 w-16 shrink-0 rounded-lg border border-black/10 object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-[#f1d0cb] bg-[#fff2f0] text-[10px] font-semibold text-[#9d3d34]">
                          Invalid URL
                        </div>
                      )}
                      <div className="min-w-0 flex-1 text-[11px] text-[#666]">
                        <p className="m-0 font-semibold text-[#171717]">
                          {previewBroken ? "Could not load image preview" : "R2 visual ready"}
                        </p>
                        <p className="m-0 truncate text-[10px] text-[#888782]">{imageUrl}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className="primary-action"
              onClick={() => void createSchedule()}
              disabled={busy !== null}
            >
              {busy === "post" ? (
                <>
                  <SpinnerGap size={16} className="animate-spin" />
                  <span>Scheduling post…</span>
                </>
              ) : (
                <>
                  <CalendarCheck size={16} />
                  <span>Schedule post</span>
                </>
              )}
            </button>
          </section>

          {/* Schedule a Reel (preserved behavior) */}
          <section className="panel composer-panel">
            <div className="panel-heading">
              <div>
                <span className="section-number">02</span>
                <h3>Schedule a Reel</h3>
              </div>
              <FilmStrip size={18} className="text-[#888782]" />
            </div>

            <div className="field-group field-grid">
              <div>
                <label htmlFor="sched-reel-page">Facebook Page</label>
                <select
                  id="sched-reel-page"
                  value={reelPage}
                  onChange={(e) => setReelPage(e.target.value as BrandName)}
                >
                  <option value="Zawaago">Zawaago</option>
                  <option value="InnoTech">InnoTech</option>
                </select>
              </div>
              <div>
                <label htmlFor="sched-reel-time">Date & time (local)</label>
                <input
                  id="sched-reel-time"
                  type="datetime-local"
                  value={reelScheduledAt}
                  onChange={(e) => setReelScheduledAt(e.target.value)}
                />
              </div>
            </div>
            {reelScheduledAt && !Number.isNaN(new Date(reelScheduledAt).getTime()) && (
              <p className="mt-1.5 text-[11px] text-[#777]">
                Target slot: <strong>{formatIst(new Date(reelScheduledAt).toISOString())}</strong>
              </p>
            )}

            <div className="field-group">
              <label htmlFor="sched-reel-title">
                Reel title <span className="font-normal text-[#888782]">(optional)</span>
              </label>
              <input
                id="sched-reel-title"
                maxLength={100}
                value={reelTitle}
                onChange={(e) => setReelTitle(e.target.value)}
                placeholder="Short Reel title"
              />
            </div>

            <div className="field-group">
              <label htmlFor="sched-reel-caption">Reel caption</label>
              <textarea
                id="sched-reel-caption"
                className="min-h-[100px]"
                value={reelCaption}
                onChange={(e) => setReelCaption(e.target.value)}
                placeholder="Final Reel caption…"
              />
            </div>

            <div className="field-group">
              <label htmlFor="sched-reel-video">Production MP4 R2 URL</label>
              <input
                id="sched-reel-video"
                value={reelVideoUrl}
                onChange={(e) => setReelVideoUrl(e.target.value)}
                placeholder="/api/autoposter/assets/generated/...mp4"
              />
              <span className="mt-1 block text-[10px] text-[#888782]">
                Only rendered MP4 assets saved in R2 are accepted for Reel publishing.
              </span>
              {liveReelVideoPreview && (
                <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-black/8 bg-[#fafaf9] p-2">
                  <video
                    key={liveReelVideoPreview}
                    src={liveReelVideoPreview}
                    className="aspect-[9/16] w-14 shrink-0 rounded-lg bg-black object-contain"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <span className="truncate text-[10px] text-[#666]">{reelVideoUrl}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="primary-action"
              onClick={() => void createReelSchedule()}
              disabled={busy !== null}
            >
              {busy === "reel" ? (
                <>
                  <SpinnerGap size={16} className="animate-spin" />
                  <span>Scheduling Reel…</span>
                </>
              ) : (
                <>
                  <FilmStrip size={16} />
                  <span>Schedule Reel</span>
                </>
              )}
            </button>
          </section>
        </div>

        {/* Scheduled Queue Section */}
        <section className="panel composer-panel mt-5">
          <div className="panel-heading flex-wrap">
            <div>
              <span className="section-number">03</span>
              <h3>Scheduled posts & Reels</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1 rounded-xl border border-black/10 bg-[#fafaf9] p-1">
                {(["All", "Zawaago", "InnoTech"] as const).map((brand) => (
                  <button
                    key={brand}
                    type="button"
                    onClick={() => setBrandFilter(brand)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      brandFilter === brand ? "bg-[#171717] text-white" : "text-black/55 hover:text-black"
                    }`}
                  >
                    {brand}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-1 rounded-xl border border-black/10 bg-[#fafaf9] p-1">
                {(
                  [
                    ["all", `All ${counts.all}`],
                    ["queued", `Queued ${counts.queued}`],
                    ["retrying", `Retrying ${counts.retrying}`],
                    ["published", `Published ${counts.published}`],
                    ["failed", `Failed ${counts.failed}`]
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setView(key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      view === key ? "bg-[#171717] text-white" : "text-black/55 hover:text-black"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-14 text-center text-sm text-[#777]">Loading schedule queue…</div>
          ) : visible.length === 0 ? (
            <div className="py-14 text-center text-sm text-[#777]">
              No items in this view. Schedules created manually or by Content Brain OS appear here automatically.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {visible.map((item) => {
                const imgSrc = resolveAssetUrl(item.imageUrl);
                const vidSrc = resolveAssetUrl(item.videoUrl);
                const isRetrying = item.status === "scheduled" && Boolean(item.retryCount && item.retryCount > 0);
                const isFromEngine = Boolean(item.contentPlanId || item.id.startsWith("plan-"));
                const isOverdue =
                  item.status === "scheduled" && new Date(item.scheduledAt).getTime() <= Date.now();
                const isExpanded = Boolean(expandedIds[item.id]);
                const isEditingTime = rescheduleId === item.id;
                const isConfirmingCancel = confirmCancelId === item.id;

                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-black/10 bg-white p-4 transition hover:border-black/20"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={`page-avatar ${item.pageName === "InnoTech" ? "alt" : ""}`}>
                            {item.pageName === "Zawaago" ? "Z" : "I"}
                          </span>
                          <strong className="text-sm font-semibold text-[#171717]">{item.pageName}</strong>

                          <span
                            className={`status-pill ${
                              item.status === "published"
                                ? "border-[#cfe9dd] bg-[#edf8f3] text-[#16845b]"
                                : item.status === "failed"
                                  ? "border-[#f1d0cb] bg-[#fff2f0] text-[#b42318]"
                                  : isRetrying
                                    ? "border-[#f3dec0] bg-[#fffaf0] text-[#9a6300]"
                                    : ""
                            }`}
                          >
                            {isRetrying ? `Retrying (${item.retryCount}/3)` : item.status}
                          </span>

                          <span className="status-pill">
                            {item.mediaType === "video"
                              ? "Reel"
                              : item.withImage
                                ? "Image post"
                                : "Text post"}
                          </span>

                          <span className="status-pill">
                            {isFromEngine ? "Content Brain" : "Manual"}
                          </span>

                          {isOverdue && !isRetrying && (
                            <span className="text-[11px] font-semibold text-[#9a6300]">
                              Due now (next Cron tick)
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#666]">
                          <span>
                            Scheduled: <strong className="text-[#222]">{formatIst(item.scheduledAt)}</strong>{" "}
                            <span className="text-[#999]">({formatLocal(item.scheduledAt)} local)</span>
                          </span>
                          {item.publishedAt && (
                            <span>
                              Published: <strong className="text-[#16845b]">{formatIst(item.publishedAt)}</strong>
                            </span>
                          )}
                          {isRetrying && item.nextRetryAt && (
                            <span>
                              Next retry: <strong className="text-[#9a6300]">{formatIst(item.nextRetryAt)}</strong>
                            </span>
                          )}
                        </div>

                        {item.title && <p className="mt-2 text-sm font-semibold text-[#171717]">{item.title}</p>}

                        <p
                          className={`mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[#333] ${
                            isExpanded ? "" : "line-clamp-3"
                          }`}
                        >
                          {item.caption}
                        </p>
                        {item.caption.length > 210 && (
                          <button
                            type="button"
                            className="text-link mt-1"
                            onClick={() =>
                              setExpandedIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                            }
                          >
                            {isExpanded ? "Show less" : "Read full caption"}
                          </button>
                        )}

                        {item.error && (
                          <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-[#f1d0cb] bg-[#fff2f0] px-3 py-2 text-xs text-[#9d3d34]">
                            <WarningCircle size={15} weight="fill" className="mt-0.5 shrink-0" />
                            <span>{item.error}</span>
                          </div>
                        )}

                        {item.facebookPostId && (
                          <p className="mt-2 text-xs font-medium text-[#16845b]">
                            Facebook ID: <span className="font-mono">{item.facebookPostId}</span>
                          </p>
                        )}

                        {isEditingTime && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-[#fafaf9] p-2.5">
                            <input
                              type="datetime-local"
                              className="rounded-lg border border-[#deddd9] bg-white px-2.5 py-1.5 text-xs"
                              value={rescheduleValue}
                              onChange={(e) => setRescheduleValue(e.target.value)}
                            />
                            <button
                              type="button"
                              className="small-action"
                              disabled={busy === `reschedule:${item.id}`}
                              onClick={() => void saveReschedule(item.id)}
                            >
                              {busy === `reschedule:${item.id}` ? "Saving…" : "Save time"}
                            </button>
                            <button
                              type="button"
                              className="small-action"
                              onClick={() => {
                                setRescheduleId(null);
                                setRescheduleValue("");
                              }}
                            >
                              Close
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Media preview */}
                      {item.mediaType === "video" && vidSrc ? (
                        brokenMediaIds[item.id] ? (
                          <div className="flex aspect-[9/16] w-28 shrink-0 flex-col items-center justify-center rounded-xl border border-black/10 bg-black/5 p-2 text-center text-[11px] text-[#777]">
                            <FilmStrip size={20} className="mb-1" />
                            <span>Video unavailable</span>
                          </div>
                        ) : (
                          <video
                            key={vidSrc}
                            src={vidSrc}
                            className="aspect-[9/16] w-28 shrink-0 rounded-xl bg-black object-contain"
                            controls
                            muted
                            playsInline
                            preload="metadata"
                            onError={() =>
                              setBrokenMediaIds((prev) => ({ ...prev, [item.id]: true }))
                            }
                          />
                        )
                      ) : imgSrc ? (
                        brokenMediaIds[item.id] ? (
                          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-black/5 p-2 text-center text-[11px] text-[#777]">
                            Image missing
                          </div>
                        ) : (
                          <img
                            src={imgSrc}
                            alt="Scheduled creative"
                            onError={() =>
                              setBrokenMediaIds((prev) => ({ ...prev, [item.id]: true }))
                            }
                            className="h-24 w-24 shrink-0 rounded-xl border border-black/8 object-cover"
                          />
                        )
                      ) : null}

                      {/* Actions */}
                      <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-col md:items-end">
                        {(item.status === "failed" || (item.status === "scheduled" && isOverdue)) && (
                          <button
                            type="button"
                            className="small-action"
                            disabled={busy === `retry:${item.id}`}
                            onClick={() => void retryItem(item.id)}
                          >
                            {busy === `retry:${item.id}` ? (
                              <SpinnerGap size={14} className="animate-spin" />
                            ) : (
                              <Play size={13} weight="fill" />
                            )}
                            <span>{item.status === "failed" ? "Retry now" : "Publish now"}</span>
                          </button>
                        )}

                        {(item.status === "scheduled" || item.status === "failed") && (
                          <button
                            type="button"
                            className="small-action"
                            onClick={() => {
                              setRescheduleId(isEditingTime ? null : item.id);
                              setRescheduleValue(
                                toLocalDatetimeInputValue(
                                  new Date(Math.max(Date.now() + 10 * 60_000, new Date(item.scheduledAt).getTime()))
                                )
                              );
                            }}
                          >
                            <PencilSimple size={14} />
                            <span>Reschedule</span>
                          </button>
                        )}

                        {(item.status === "scheduled" || item.status === "failed") &&
                          (!isConfirmingCancel ? (
                            <button
                              type="button"
                              className="small-action danger"
                              title="Cancel schedule"
                              onClick={() => setConfirmCancelId(item.id)}
                            >
                              <Trash size={14} />
                              <span>Cancel</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                className="small-action danger font-semibold"
                                disabled={busy === `cancel:${item.id}`}
                                onClick={() => void cancelItem(item.id)}
                              >
                                {busy === `cancel:${item.id}` ? "Cancelling…" : "Confirm"}
                              </button>
                              <button
                                type="button"
                                className="small-action"
                                onClick={() => setConfirmCancelId(null)}
                              >
                                Keep
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <div className="mt-4 flex items-center gap-2 text-xs text-[#777]">
          <CheckCircle size={15} />
          <span>
            Scheduled records stay synced with Content Brain OS, Cloudflare Cron, D1, and R2 History for full auditability.
          </span>
        </div>
      </div>
    </main>
  );
}
