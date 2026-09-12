import { useMemo, useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  ClipboardText,
  ClockCounterClockwise,
  CalendarCheck,
  CloudArrowUp,
  Copy,
  FacebookLogo,
  GearSix,
  ImageSquare,
  MagicWand,
  PencilSimple,
  Pulse,
  Sparkle,
  SpinnerGap,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

const pages = [
  { id: "Zawaago", name: "Zawaago", handle: "AI • Automation • Innovation", mark: "Z" },
  { id: "InnoTech", name: "InnoTech", handle: "Technology • Education", mark: "I" },
];
const contentTypes = ["AI Agents & Automation", "AI Apps & Tools", "Business Consulting", "Innovation Strategy", "AI News & Insights", "Founder Productivity", "Case Study", "Product Promotion", "Educational", "Thought Leadership"];
const tones = ["Professional Hinglish", "Professional English", "Professional Hindi", "Simple & Friendly", "Conversational", "Storytelling", "Thought Leadership", "Bold & Authoritative", "Technical Deep Dive", "Analytical", "Persuasive", "Inspirational", "Viral Hook", "Founder Voice", "Consultant Voice", "News Style"];
const languages = ["English", "Hindi", "Hinglish", "English + Hindi"];
const audiences = ["Business Owners", "Startup Founders", "Corporate Professionals", "Students", "Developers", "Marketers", "Consultants", "General Audience", "Custom"];
const visualStyles = ["Premium Editorial", "Corporate", "Minimal", "Futuristic", "Technology", "Cinematic", "Photorealistic", "3D", "Illustration", "Infographic", "Isometric", "Human-centric", "Startup", "Luxury", "Dark Tech", "Clean White", "Indian Business"];
const ratios = ["Square 1:1", "Portrait 4:5", "Portrait 9:16", "Landscape 16:9"];
const brandingModes = ["No branding", "Subtle watermark", "Branded creative"];
const logoPositions = ["Top Left", "Top Right", "Bottom Left", "Bottom Right"];
const ctas = ["None", "Learn More", "Try It", "Contact Us", "Book Consultation", "Visit Website", "Comment Your View", "Follow for More"];

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("FB_TOKEN")) return "Facebook connection is not configured. Check the Page credentials in Cloudflare.";
  if (message.includes("Page ID")) return message;
  if (message.includes("publicly hosted")) return "Image storage is not connected yet. Configure the Cloudflare R2 asset binding before image publishing.";
  if (message.includes("Failed to fetch")) return "The server could not be reached. Check the deployment and try again.";
  return message || "Something went wrong. Please try again.";
}

function buildPromptPresets(page: string, contentType: string, tone: string, language: string, audience: string, visualStyle: string, aspectRatio: string, branding: string, logoPosition: string, cta: string) {
  const brand = page === "InnoTech" ? "InnoTech" : "Zawaago";
  const educational = contentType === "Educational" || audience === "Students";
  const subject = educational
    ? "clear visual explanation of the core concept, with one strong real-world example and an intuitive visual metaphor"
    : contentType === "Product Promotion"
      ? "premium product/service hero composition showing the practical outcome and value for the target audience"
      : contentType === "Case Study"
        ? "credible before-and-after business scenario showing the problem, intervention and practical result without invented metrics"
        : contentType === "AI News & Insights"
          ? "current-looking technology editorial visual focused on the idea, avoiding fake headlines, fake logos and fabricated UI"
          : "strong editorial concept that communicates one clear business or technology idea at a glance";
  const cleanBrand = branding === "No branding"
    ? "Do not include any logo, brand name or watermark in the artwork."
    : `Keep a clean ${logoPosition.toLowerCase()} safe area for the ${brand} logo to be overlaid later; never draw or invent the logo itself.`;
  const common = `Create a ${visualStyle.toLowerCase()} social creative for ${brand}. Subject: ${subject}. Content direction: ${contentType}. Audience: ${audience}. Tone: ${tone}. Language context: ${language}. Composition: ${aspectRatio}; premium commercial art direction, strong focal hierarchy, balanced negative space, mobile-first readability. ${cleanBrand} CTA context: ${cta}. No generator watermark, platform watermark, signature, fake UI, fake statistics, fake logos, long text or illegible typography. Use realistic detail, coherent lighting, polished composition and an original visual concept.`;
  return [
    { label: "Best overall — premium editorial", value: `${common} Make the concept immediately understandable within two seconds and visually distinctive without becoming busy.` },
    { label: "Human story — relatable and credible", value: `${common} Center the scene around believable people and a natural professional environment. Capture an authentic moment rather than a staged stock-photo pose.` },
    { label: "Concept visual — smart visual metaphor", value: `${common} Turn the idea into one elegant visual metaphor with depth, symbolism and clear cause-and-effect. Keep the metaphor sophisticated and easy to decode.` },
    { label: educational ? "Education — explain, don't decorate" : "Authority — consultant-grade insight", value: `${common} Prioritize clarity and teaching value. Show the mechanism, workflow or real-world context visually. Avoid decorative complexity and make the image useful even without the caption.` },
  ];
}

type SeriesPost = { episode: number; title: string; hook: string; caption: string; visualPrompt: string };

export default function Autoposter() {
  const [page, setPage] = useState("Zawaago");
  const [topic, setTopic] = useState("How AI Agents save time for business owners");
  const [contentType, setContentType] = useState(contentTypes[0]);
  const [tone, setTone] = useState(tones[0]);
  const [language, setLanguage] = useState("English");
  const [audience, setAudience] = useState(audiences[0]);
  const [visualStyle, setVisualStyle] = useState(visualStyles[0]);
  const [aspectRatio, setAspectRatio] = useState(ratios[0]);
  const [branding, setBranding] = useState(brandingModes[1]);
  const [logoPosition, setLogoPosition] = useState(logoPositions[3]);
  const [cta, setCta] = useState(ctas[0]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [busy, setBusy] = useState<"generate" | "image" | "text" | "photo" | "health" | "series" | null>(null);
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error" | "info"; text: string }>({ type: "idle", text: "" });
  const [health, setHealth] = useState<any>(null);
  const [showHealth, setShowHealth] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSeries, setShowSeries] = useState(false);
  const [series, setSeries] = useState<SeriesPost[]>([]);
  const [seriesLength, setSeriesLength] = useState(5);
  const [intervalHours, setIntervalHours] = useState(24);
  const [copied, setCopied] = useState(false);
  const [seriesCopied, setSeriesCopied] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"caption" | "image">("caption");
  const [showAdvanced, setShowAdvanced] = useState(false);

  function openScheduler() {
    if (!caption.trim()) return setStatus({ type: "error", text: "Generate or write a caption before scheduling." });
    localStorage.setItem("autoposter:schedule-draft", JSON.stringify({ page, caption, imageUrl }));
    window.location.href = "/schedule";
  }

  const selectedPage = pages.find((item) => item.id === page) ?? pages[0];
  const canPublish = caption.trim().length > 0 && !busy;
  const progress = busy === "generate" ? ["Understanding brief", "Writing caption", "Building visual direction"] : busy === "image" ? ["Preparing creative brief", "Generating high-quality visual", "Preparing preview"] : busy === "series" ? ["Planning the learning journey", "Writing connected lessons", "Creating visual directions"] : [];
  const characterCount = caption.length;
  const briefPayload = useMemo(() => ({ pageName: page, topic, contentType, tone, language, audience, visualStyle, aspectRatio, branding, logoPosition, cta, customPrompt }), [page, topic, contentType, tone, language, audience, visualStyle, aspectRatio, branding, logoPosition, cta, customPrompt]);
  const promptPresets = useMemo(() => buildPromptPresets(page, contentType, tone, language, audience, visualStyle, aspectRatio, branding, logoPosition, cta), [page, contentType, tone, language, audience, visualStyle, aspectRatio, branding, logoPosition, cta]);

  async function generate() {
    if (!topic.trim()) return setStatus({ type: "error", text: "Add a core idea first so the AI knows what to create." });
    setBusy("generate"); setStatus({ type: "info", text: "Building your content brief and brand-aware prompt…" });
    try {
      const res = await fetch("/api/autoposter/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(briefPayload) });
      const data: any = await res.json(); if (!res.ok) throw new Error(data.details || data.error || "Generation failed");
      setCaption(data.caption || ""); setImageUrl(""); setImagePrompt(data.imagePrompt || ""); setActiveTab("caption"); setStatus({ type: "success", text: "Draft ready. Caption and visual direction are editable before publishing." });
    } catch (error) { setStatus({ type: "error", text: friendlyError(error) }); } finally { setBusy(null); }
  }

  async function generateImage(promptOverride?: string) {
    if (!topic.trim()) return setStatus({ type: "error", text: "Add a core idea before generating an image." });
    const selectedPrompt = promptOverride ?? imagePrompt;
    setBusy("image"); setStatus({ type: "info", text: "Generating a high-quality visual from the selected settings…" });
    try {
      const res = await fetch("/api/autoposter/generate-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...briefPayload, imgPrompt: selectedPrompt }) });
      const data: any = await res.json(); if (!res.ok) throw new Error(data.details || data.error || "Image generation failed");
      setImageUrl(data.imageUrl || ""); setImagePrompt(data.prompt || selectedPrompt); setActiveTab("image"); setStatus({ type: "success", text: "Visual ready · Cloudflare AI + R2 · no generator watermark." });
    } catch (error) { setStatus({ type: "error", text: friendlyError(error) }); } finally { setBusy(null); }
  }

  async function generateSeries() {
    if (!topic.trim()) return setStatus({ type: "error", text: "Add a core idea for the education series first." });
    setBusy("series"); setStatus({ type: "info", text: `Building a ${seriesLength}-part education series with a ${intervalHours}-hour posting interval…` });
    try {
      const res = await fetch("/api/autoposter/generate-series", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...briefPayload, seriesLength, intervalHours }) });
      const data: any = await res.json(); if (!res.ok) throw new Error(data.details || data.error || "Series generation failed");
      setSeries(Array.isArray(data.series) ? data.series : []); setShowSeries(true); setStatus({ type: "success", text: `${data.series?.length || 0}-part education series is ready. Each episode keeps your selected brand, language, tone and visual settings.` });
    } catch (error) { setStatus({ type: "error", text: friendlyError(error) }); } finally { setBusy(null); }
  }

  function useSeriesPost(post: SeriesPost) {
    setCaption(post.caption); setImagePrompt(post.visualPrompt); setImageUrl(""); setActiveTab("caption"); setShowSeries(false); setTopic(`${topic} · ${post.title}`); setStatus({ type: "info", text: `Episode ${post.episode} loaded. Generate its visual when ready.` });
  }

  async function copyText(text: string, episode?: number) {
    try { await navigator.clipboard.writeText(text); if (episode) { setSeriesCopied(episode); window.setTimeout(() => setSeriesCopied(null), 1800); } else { setCopied(true); setStatus({ type: "success", text: "Caption copied to clipboard." }); window.setTimeout(() => setCopied(false), 1800); } } catch { setStatus({ type: "error", text: "Clipboard access was blocked by the browser." }); }
  }

  async function postNow(withImage = false) {
    if (!caption.trim()) return setStatus({ type: "error", text: "Write or generate a caption before publishing." });
    if (withImage && !imageUrl) return setStatus({ type: "error", text: "Generate a visual before publishing an image post." });
    setBusy(withImage ? "photo" : "text"); setStatus({ type: "info", text: withImage ? `Publishing image to ${selectedPage.name}…` : `Publishing text to ${selectedPage.name}…` });
    try {
      const res = await fetch("/api/autoposter/post-now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page, caption, imageUrl, withImage }) });
      const data: any = await res.json(); if (!res.ok || data.error) throw new Error(data.details || data.error || "Facebook post failed");
      setStatus({ type: "success", text: `Published successfully to ${selectedPage.name}. Post ID: ${data.id || "accepted"}` });
    } catch (error) { setStatus({ type: "error", text: friendlyError(error) }); } finally { setBusy(null); }
  }

  async function checkHealth() {
    setBusy("health");
    try { const res = await fetch("/api/autoposter/health"); const data: any = await res.json(); if (!res.ok) throw new Error(data.error || "Health check failed"); setHealth(data); setShowHealth(true); setStatus({ type: "success", text: "System check completed." }); }
    catch (error) { setStatus({ type: "error", text: friendlyError(error) }); } finally { setBusy(null); }
  }

  function clearDraft() { setCaption(""); setImageUrl(""); setImagePrompt(""); setStatus({ type: "info", text: "Draft cleared. Your brief settings are kept." }); }
  const statusIcon = status.type === "success" ? <CheckCircle size={19} weight="fill" /> : status.type === "error" ? <WarningCircle size={19} weight="fill" /> : <Pulse size={19} />;

  return (
    <main className="autoposter-shell min-h-screen text-[#171717]"><div className="mx-auto w-full max-w-[1380px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <header className="studio-header"><div className="flex min-w-0 items-center gap-3"><div className="brand-mark">Z</div><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-[18px] font-semibold tracking-[-0.03em] sm:text-[20px]">Zawaago Autoposter</h1><span className="status-pill"><span className="live-dot" /> Live</span></div><p className="mt-0.5 hidden text-[12px] text-[#777] sm:block">AI Social Content Studio · create, refine, publish</p></div></div><div className="flex items-center gap-2"><a className="icon-button" href="/history" title="Publishing history"><ClockCounterClockwise size={19} /><span className="hidden sm:inline">History</span></a><button className="icon-button" title="Schedule post" onClick={openScheduler} disabled={!!busy}><CalendarCheck size={19} /><span className="hidden sm:inline">Schedule</span></button><button className="icon-button" title="System health" onClick={checkHealth} disabled={!!busy}>{busy === "health" ? <SpinnerGap className="animate-spin" size={19} /> : <Pulse size={19} />}<span className="hidden sm:inline">Health</span></button><button className="icon-button" title="Studio settings" onClick={() => setShowSettings(true)} disabled={!!busy}><GearSix size={19} /><span className="hidden sm:inline">Settings</span></button></div></header>
      <section className="hero-strip"><div><div className="eyebrow"><Sparkle size={14} weight="fill" /> CONTENT STUDIO</div><h2>Create something worth stopping for.</h2><p>Turn one idea into a brand-aware caption and visual, or build a connected education series for spaced publishing.</p></div><div className="hero-stat hidden md:flex"><span>2</span><small>brands<br />connected</small></div></section>
      <div className="workspace-grid">
        <section className="panel composer-panel"><div className="panel-heading"><div><span className="section-number">01</span><h3>Build the brief</h3></div><span className="muted-label">AI-assisted</span></div>
          <div className="field-group"><label>Publish as</label><div className="page-switcher">{pages.map((item) => <button key={item.id} type="button" onClick={() => setPage(item.id)} className={`page-option ${page === item.id ? "selected" : ""}`}><span className={`page-avatar ${item.id === "InnoTech" ? "alt" : ""}`}>{item.mark}</span><span className="page-copy"><strong>{item.name}</strong><small>{item.handle}</small></span>{page === item.id && <CheckCircle className="ml-auto" size={19} weight="fill" />}</button>)}</div></div>
          <div className="field-grid"><div className="field-group"><label>Content direction</label><select value={contentType} onChange={(e) => setContentType(e.target.value)}>{contentTypes.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Voice & tone</label><select value={tone} onChange={(e) => setTone(e.target.value)}>{tones.map((item) => <option key={item}>{item}</option>)}</select></div></div>
          <div className="field-grid"><div className="field-group"><label>Language</label><select value={language} onChange={(e) => setLanguage(e.target.value)}>{languages.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Target audience</label><select value={audience} onChange={(e) => setAudience(e.target.value)}>{audiences.map((item) => <option key={item}>{item}</option>)}</select></div></div>
          <div className="field-group"><div className="flex items-center justify-between"><label>Core idea</label><span className="field-hint">What should people remember?</span></div><textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={5} placeholder="Describe the idea, problem, launch, insight or story…" /></div>
          <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-left text-sm font-semibold transition hover:bg-black/[0.025]"><span className="flex items-center justify-between"><span>Advanced creative controls</span><span className="text-xs text-black/45">{showAdvanced ? "Hide" : "Optional"}</span></span></button>
          {showAdvanced && <div className="mt-3 space-y-3 rounded-2xl border border-black/8 bg-[#faf9f7] p-3"><div className="field-grid"><div className="field-group"><label>Visual style</label><select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)}>{visualStyles.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Aspect ratio</label><select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>{ratios.map((item) => <option key={item}>{item}</option>)}</select></div></div><div className="field-grid"><div className="field-group"><label>Branding</label><select value={branding} onChange={(e) => setBranding(e.target.value)}>{brandingModes.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Logo position</label><select value={logoPosition} onChange={(e) => setLogoPosition(e.target.value)}>{logoPositions.map((item) => <option key={item}>{item}</option>)}</select></div></div><div className="field-group"><label>CTA</label><select value={cta} onChange={(e) => setCta(e.target.value)}>{ctas.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Creative prompt — matched to your settings</label><select value="" onChange={(e) => { if (e.target.value) setCustomPrompt(e.target.value); }}><option value="">Choose a quality prompt preset…</option>{promptPresets.map((item) => <option key={item.label} value={item.value}>{item.label}</option>)}</select><textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} rows={4} placeholder="Choose a preset above, or write your own creative direction…" /><p className="field-hint">Presets automatically reflect Page, content direction, tone, language, audience, visual style, ratio, branding and CTA.</p></div></div>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" onClick={generate} disabled={!!busy} className="primary-action">{busy === "generate" ? <><SpinnerGap className="animate-spin" size={19} /> Creating draft…</> : <><MagicWand size={19} weight="fill" /> Generate content</>}</button><button type="button" onClick={() => { if (!showAdvanced) setShowAdvanced(true); generateSeries(); }} disabled={!!busy} className="secondary-action"><Sparkle size={18} weight="fill" /> {busy === "series" ? "Building series…" : "Education series"}</button></div>{progress.length > 0 && <div className="progress-list">{progress.map((item, index) => <div key={item}><span>{index + 1}</span>{item}</div>)}</div>}
        </section>
        <section className="panel preview-panel"><div className="panel-heading"><div><span className="section-number">02</span><h3>Review & refine</h3></div><div className="flex items-center gap-2"><button className="icon-button small" onClick={clearDraft} title="Clear draft"><Trash size={17} /></button></div></div>
          <div className="preview-tabs"><button className={activeTab === "caption" ? "active" : ""} onClick={() => setActiveTab("caption")}>Caption</button><button className={activeTab === "image" ? "active" : ""} onClick={() => setActiveTab("image")}>Visual</button></div>
          {activeTab === "caption" ? <div className="editor-card"><div className="editor-toolbar"><span><PencilSimple size={15} /> Editable draft</span><button onClick={() => copyText(caption)} disabled={!caption}>{copied ? <CheckCircle size={16} weight="fill" /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}</button></div><textarea className="caption-editor" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Your AI-generated caption will appear here…" /><div className="editor-footer"><span>{characterCount} characters</span><span>Facebook-ready</span></div></div> : <div className="visual-card">{imageUrl ? <img src={imageUrl} alt="Generated social creative" /> : <div className="empty-visual"><ImageSquare size={42} /><strong>Your visual will appear here</strong><span>Generate content first, then create the visual.</span></div>}<div className="visual-actions"><button className="secondary-action" onClick={() => generateImage()} disabled={!!busy || !topic.trim()}>{busy === "image" ? <><SpinnerGap className="animate-spin" size={18} /> Generating…</> : <><ArrowClockwise size={18} /> {imageUrl ? "Regenerate visual" : "Generate visual"}</>}</button></div></div>}
          {status.text && <div className={`status-banner ${status.type}`}><span>{statusIcon}</span><span>{status.text}</span></div>}
        </section>
      </div>
      <section className="panel publish-panel"><div className="panel-heading"><div><span className="section-number">03</span><h3>Publish</h3></div><span className="muted-label">Selected: {selectedPage.name}</span></div><div className="publish-actions"><button className="secondary-action" disabled={!canPublish} onClick={() => postNow(false)}><FacebookLogo size={18} weight="fill" /> {busy === "text" ? "Publishing…" : "Post text"}</button><button className="primary-action compact" disabled={!canPublish || !imageUrl} onClick={() => postNow(true)}><CloudArrowUp size={18} weight="fill" /> {busy === "photo" ? "Publishing…" : "Post with image"}</button></div></section>
    </div>
    {showSeries && <div className="modal-backdrop" onClick={() => setShowSeries(false)}><div className="modal-card max-w-3xl" onClick={(e) => e.stopPropagation()}><div className="modal-heading"><div><span className="modal-eyebrow"><Sparkle size={14} weight="fill" /> EDUCATION SERIES</span><h3>{series.length}-part learning series</h3><p>Generated from your current Page, topic, tone, language, audience and creative settings.</p></div><button className="icon-button small" onClick={() => setShowSeries(false)} aria-label="Close series"><X size={18} /></button></div><div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl border border-black/8 bg-[#faf9f7] p-3"><small className="block text-xs text-black/45">Posts</small><strong>{series.length}</strong></div><div className="rounded-xl border border-black/8 bg-[#faf9f7] p-3"><small className="block text-xs text-black/45">Interval</small><strong>{intervalHours}h</strong></div><div className="rounded-xl border border-black/8 bg-[#faf9f7] p-3"><small className="block text-xs text-black/45">Page</small><strong>{page}</strong></div><div className="rounded-xl border border-black/8 bg-[#faf9f7] p-3"><small className="block text-xs text-black/45">Language</small><strong>{language}</strong></div></div><div className="space-y-3">{series.map((post) => <article key={post.episode} className="rounded-2xl border border-black/8 bg-white p-4"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-xs font-bold text-white">{post.episode}</span><div className="min-w-0 flex-1"><h4 className="font-semibold">{post.title}</h4><p className="mt-1 text-sm font-medium text-black/65">{post.hook}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/75">{post.caption}</p><details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-black/55">Visual direction</summary><p className="mt-2 rounded-lg bg-[#faf9f7] p-3 text-xs leading-5 text-black/65">{post.visualPrompt}</p></details><div className="mt-3 flex flex-wrap gap-2"><button className="secondary-action compact" onClick={() => useSeriesPost(post)}><PencilSimple size={15} /> Use episode</button><button className="secondary-action compact" onClick={() => copyText(post.caption, post.episode)}>{seriesCopied === post.episode ? <CheckCircle size={15} weight="fill" /> : <Copy size={15} />} {seriesCopied === post.episode ? "Copied" : "Copy"}</button></div></div></div></article>)}</div><div className="mt-4 rounded-xl border border-black/8 bg-[#faf9f7] p-3 text-xs leading-5 text-black/55">Scheduling is intentionally not auto-publishing yet. Use each episode when you are ready; the selected interval is stored as the series plan so it can be connected to the scheduling engine in the next phase.</div></div></div>}
    {showHealth && <div className="modal-backdrop" onClick={() => setShowHealth(false)}><div className="modal-card health-modal" onClick={(e) => e.stopPropagation()}><div className="modal-heading"><div><span className="modal-eyebrow"><Pulse size={14} weight="fill" /> SYSTEM STATUS</span><h3>System health</h3><p>Live connectivity check for the production studio.</p></div><button className="icon-button small" onClick={() => setShowHealth(false)} aria-label="Close system health"><X size={18} /></button></div><div className="health-summary"><span className="health-status-dot" /><div><strong>{health?.status === "ok" ? "All systems operational" : "Attention required"}</strong><small>{health?.timestamp ? `Checked ${new Date(health.timestamp).toLocaleString()}` : "Status check completed"}</small></div><span className="health-badge">{health?.status === "ok" ? "Operational" : "Review"}</span></div><div className="health-grid"><div className="health-item"><span className="health-icon"><Sparkle size={17} weight="fill" /></span><div><strong>Workers AI</strong><small>AI generation service</small></div><b>{health?.aiConfigured ? "Connected" : "Not configured"}</b></div><div className="health-item"><span className="health-icon"><FacebookLogo size={17} weight="fill" /></span><div><strong>Facebook</strong><small>Zawaago · InnoTech Pages</small></div><b>{health?.zawaagoFacebookTokenConfigured && health?.innotechFacebookTokenConfigured ? "Connected" : "Review"}</b></div><div className="health-item"><span className="health-icon"><CloudArrowUp size={17} weight="fill" /></span><div><strong>Image storage</strong><small>Cloudflare R2 asset storage</small></div><b>{health?.imageStorageConfigured ? "Connected" : "Review"}</b></div><div className="health-item"><span className="health-icon"><Pulse size={17} /></span><div><strong>Graph API</strong><small>Facebook Graph {health?.graphVersion || ""}</small></div><b>{health?.graphVersion ? "Ready" : "Review"}</b></div></div><details className="health-details"><summary><ClipboardText size={16} /> Technical details</summary><pre>{JSON.stringify(health, null, 2)}</pre></details></div></div>}
    {showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}><div className="modal-card settings-modal" onClick={(e) => e.stopPropagation()}><div className="modal-heading"><div><span className="modal-eyebrow"><GearSix size={14} /> STUDIO CONFIGURATION</span><h3>Studio settings</h3><p>Review the active creative configuration for your next post.</p></div><button className="icon-button small" onClick={() => setShowSettings(false)} aria-label="Close studio settings"><X size={18} /></button></div><div className="settings-section"><div className="settings-section-heading"><span>Active brief</span><small>Current session</small></div><div className="settings-grid"><div><span>Publishing as</span><strong>{selectedPage.name}</strong></div><div><span>Language</span><strong>{language}</strong></div><div><span>Voice & tone</span><strong>{tone}</strong></div><div><span>Audience</span><strong>{audience}</strong></div><div><span>Visual style</span><strong>{visualStyle}</strong></div><div><span>Aspect ratio</span><strong>{aspectRatio}</strong></div><div><span>Branding</span><strong>{branding}</strong></div><div><span>CTA</span><strong>{cta}</strong></div></div></div><div className="settings-section"><div className="settings-section-heading"><span>Production roadmap</span><small>Next phases</small></div><div className="roadmap-list"><div><span className="roadmap-index">01</span><div><strong>Persistent database</strong><small>Save briefs, drafts and publishing records.</small></div><span className="roadmap-badge">Next</span></div><div><span className="roadmap-index">02</span><div><strong>Asset management</strong><small>Organize generated creatives and reusable assets.</small></div><span className="roadmap-badge">Next</span></div><div><span className="roadmap-index">03</span><div><strong>Scheduling</strong><small>Publish education-series episodes at planned intervals.</small></div><span className="roadmap-badge">Next</span></div></div></div><div className="settings-note"><CheckCircle size={17} weight="fill" /><span>Changes to creative controls are made directly in the brief on the main studio screen.</span></div></div></div>}
  </main>
  );
}
