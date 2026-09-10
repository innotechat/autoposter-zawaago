import { useMemo, useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  ClipboardText,
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
  const [busy, setBusy] = useState<"generate" | "image" | "text" | "photo" | "health" | null>(null);
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error" | "info"; text: string }>({ type: "idle", text: "" });
  const [health, setHealth] = useState<any>(null);
  const [showHealth, setShowHealth] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"caption" | "image">("caption");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedPage = pages.find((item) => item.id === page) ?? pages[0];
  const canPublish = caption.trim().length > 0 && !busy;
  const progress = busy === "generate" ? ["Understanding brief", "Writing caption", "Building visual direction"] : busy === "image" ? ["Preparing creative brief", "Generating high-quality visual", "Preparing preview"] : [];
  const characterCount = caption.length;

  const briefPayload = useMemo(() => ({ pageName: page, topic, contentType, tone, language, audience, visualStyle, aspectRatio, branding, logoPosition, cta, customPrompt }), [page, topic, contentType, tone, language, audience, visualStyle, aspectRatio, branding, logoPosition, cta, customPrompt]);

  async function generate() {
    if (!topic.trim()) return setStatus({ type: "error", text: "Add a core idea first so the AI knows what to create." });
    setBusy("generate");
    setStatus({ type: "info", text: "Building your content brief and brand-aware prompt…" });
    try {
      const res = await fetch("/api/autoposter/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(briefPayload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Generation failed");
      setCaption(data.caption || "");
      setImageUrl("");
      setImagePrompt(data.imagePrompt || "");
      setActiveTab("caption");
      setStatus({ type: "success", text: "Draft ready. Caption and visual direction are editable before publishing." });
    } catch (error) { setStatus({ type: "error", text: friendlyError(error) }); }
    finally { setBusy(null); }
  }

  async function generateImage() {
    if (!topic.trim()) return setStatus({ type: "error", text: "Add a core idea before generating an image." });
    setBusy("image");
    setStatus({ type: "info", text: "Generating a high-quality visual from your full creative brief…" });
    try {
      const res = await fetch("/api/autoposter/generate-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...briefPayload, imgPrompt: imagePrompt }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Image generation failed");
      setImageUrl(data.imageUrl || "");
      setImagePrompt(data.prompt || imagePrompt);
      setActiveTab("image");
      setStatus({ type: "success", text: `Visual ready · ${data.source === "cloudflare-flux-r2" ? "Cloudflare AI + R2" : "high-resolution fallback"}.` });
    } catch (error) { setStatus({ type: "error", text: friendlyError(error) }); }
    finally { setBusy(null); }
  }

  async function postNow(withImage = false) {
    if (!caption.trim()) return setStatus({ type: "error", text: "Write or generate a caption before publishing." });
    if (withImage && !imageUrl) return setStatus({ type: "error", text: "Generate a visual before publishing an image post." });
    setBusy(withImage ? "photo" : "text");
    setStatus({ type: "info", text: withImage ? `Publishing image to ${selectedPage.name}…` : `Publishing text to ${selectedPage.name}…` });
    try {
      const res = await fetch("/api/autoposter/post-now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page, caption, imageUrl, withImage }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.details || data.error || "Facebook post failed");
      setStatus({ type: "success", text: `Published successfully to ${selectedPage.name}. Post ID: ${data.id || "accepted"}` });
    } catch (error) { setStatus({ type: "error", text: friendlyError(error) }); }
    finally { setBusy(null); }
  }

  async function checkHealth() {
    setBusy("health");
    try {
      const res = await fetch("/api/autoposter/health");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Health check failed");
      setHealth(data); setShowHealth(true); setStatus({ type: "success", text: "System check completed." });
    } catch (error) { setStatus({ type: "error", text: friendlyError(error) }); }
    finally { setBusy(null); }
  }

  async function copyCaption() {
    if (!caption) return;
    try { await navigator.clipboard.writeText(caption); setCopied(true); setStatus({ type: "success", text: "Caption copied to clipboard." }); window.setTimeout(() => setCopied(false), 1800); }
    catch { setStatus({ type: "error", text: "Clipboard access was blocked by the browser." }); }
  }

  function clearDraft() { setCaption(""); setImageUrl(""); setImagePrompt(""); setStatus({ type: "info", text: "Draft cleared. Your brief settings are kept." }); }
  const statusIcon = status.type === "success" ? <CheckCircle size={19} weight="fill" /> : status.type === "error" ? <WarningCircle size={19} weight="fill" /> : <Pulse size={19} />;

  return (
    <main className="autoposter-shell min-h-screen text-[#171717]">
      <div className="mx-auto w-full max-w-[1380px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <header className="studio-header">
          <div className="flex min-w-0 items-center gap-3"><div className="brand-mark">Z</div><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-[18px] font-semibold tracking-[-0.03em] sm:text-[20px]">Zawaago Autoposter</h1><span className="status-pill"><span className="live-dot" /> Live</span></div><p className="mt-0.5 hidden text-[12px] text-[#777] sm:block">AI Social Content Studio · create, refine, publish</p></div></div>
          <div className="flex items-center gap-2"><button className="icon-button" title="System health" onClick={checkHealth} disabled={!!busy}>{busy === "health" ? <SpinnerGap className="animate-spin" size={19} /> : <Pulse size={19} />}<span className="hidden sm:inline">Health</span></button><button className="icon-button" title="Studio settings" onClick={() => setShowSettings(true)} disabled={!!busy}><GearSix size={19} /><span className="hidden sm:inline">Settings</span></button></div>
        </header>

        <section className="hero-strip"><div><div className="eyebrow"><Sparkle size={14} weight="fill" /> CONTENT STUDIO</div><h2>Create something worth stopping for.</h2><p>Turn one idea into a brand-aware caption and visual, then review the finished post before it reaches Facebook.</p></div><div className="hero-stat hidden md:flex"><span>2</span><small>brands<br />connected</small></div></section>

        <div className="workspace-grid">
          <section className="panel composer-panel">
            <div className="panel-heading"><div><span className="section-number">01</span><h3>Build the brief</h3></div><span className="muted-label">AI-assisted</span></div>
            <div className="field-group"><label>Publish as</label><div className="page-switcher">{pages.map((item) => <button key={item.id} type="button" onClick={() => setPage(item.id)} className={`page-option ${page === item.id ? "selected" : ""}`}><span className={`page-avatar ${item.id === "InnoTech" ? "alt" : ""}`}>{item.mark}</span><span className="page-copy"><strong>{item.name}</strong><small>{item.handle}</small></span>{page === item.id && <CheckCircle className="ml-auto" size={19} weight="fill" />}</button>)}</div></div>
            <div className="field-grid"><div className="field-group"><label>Content direction</label><select value={contentType} onChange={(e) => setContentType(e.target.value)}>{contentTypes.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Voice & tone</label><select value={tone} onChange={(e) => setTone(e.target.value)}>{tones.map((item) => <option key={item}>{item}</option>)}</select></div></div>
            <div className="field-grid"><div className="field-group"><label>Language</label><select value={language} onChange={(e) => setLanguage(e.target.value)}>{languages.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Target audience</label><select value={audience} onChange={(e) => setAudience(e.target.value)}>{audiences.map((item) => <option key={item}>{item}</option>)}</select></div></div>
            <div className="field-group"><div className="flex items-center justify-between"><label>Core idea</label><span className="field-hint">What should people remember?</span></div><textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={5} placeholder="Describe the idea, problem, launch, insight or story…" /></div>
            <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-left text-sm font-semibold transition hover:bg-black/[0.025]"><span className="flex items-center justify-between"><span>Advanced creative controls</span><span className="text-xs text-black/45">{showAdvanced ? "Hide" : "Optional"}</span></span></button>
            {showAdvanced && <div className="mt-3 space-y-3 rounded-2xl border border-black/8 bg-[#faf9f7] p-3"><div className="field-grid"><div className="field-group"><label>Visual style</label><select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)}>{visualStyles.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Aspect ratio</label><select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>{ratios.map((item) => <option key={item}>{item}</option>)}</select></div></div><div className="field-grid"><div className="field-group"><label>Branding</label><select value={branding} onChange={(e) => setBranding(e.target.value)}>{brandingModes.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Logo position</label><select value={logoPosition} onChange={(e) => setLogoPosition(e.target.value)}>{logoPositions.map((item) => <option key={item}>{item}</option>)}</select></div></div><div className="field-group"><label>CTA</label><select value={cta} onChange={(e) => setCta(e.target.value)}>{ctas.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Additional creative direction</label><textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} rows={3} placeholder="Optional: people, setting, mood, campaign angle, visual references…" /></div></div>}
            <button type="button" onClick={generate} disabled={!!busy} className="primary-action">{busy === "generate" ? <><SpinnerGap className="animate-spin" size={19} /> Creating draft…</> : <><MagicWand size={19} weight="fill" /> Generate post</>}</button>
            {busy === "generate" && <div className="mt-3 space-y-1 rounded-xl border border-black/8 bg-white p-3 text-xs text-black/60">{progress.map((step, index) => <div key={step} className="flex items-center gap-2"><span className={index < 1 ? "text-black" : "text-black/35"}>{index < 1 ? "✓" : "•"}</span>{step}</div>)}</div>}
            <p className="micro-note"><span className="tiny-shield" /> Your draft stays editable until you choose to publish.</p>
          </section>

          <section className="panel preview-panel">
            <div className="panel-heading preview-heading"><div><span className="section-number">02</span><h3>Review & refine</h3></div><div className="preview-actions"><button className="small-action" onClick={copyCaption} disabled={!caption}>{copied ? <CheckCircle size={16} weight="fill" /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}</button><button className="small-action danger" onClick={clearDraft} disabled={!caption && !imageUrl}><Trash size={16} /> Clear</button></div></div>
            <div className="preview-tabs"><button className={activeTab === "caption" ? "active" : ""} onClick={() => setActiveTab("caption")}><PencilSimple size={16} /> Caption</button><button className={activeTab === "image" ? "active" : ""} onClick={() => setActiveTab("image")}><ImageSquare size={16} /> Visual</button></div>
            {activeTab === "caption" ? <div className="editor-card"><div className="editor-toolbar"><span>{selectedPage.name} · Facebook post</span><span>{characterCount} characters</span></div><textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Your generated post will appear here. You can edit every word before publishing." className="caption-editor" /><div className="editor-footer"><span>Direct editing enabled</span><button onClick={() => setActiveTab("image")} className="text-link">Review visual <span>→</span></button></div></div> : <div className="visual-editor"><div className="visual-frame">{imageUrl ? <img src={imageUrl} alt="Generated social visual" /> : <div className="visual-empty"><ImageSquare size={38} /><strong>No visual yet</strong><span>Generate a visual from your full brief.</span></div>}{busy === "image" && <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white"><div className="text-center"><SpinnerGap className="mx-auto animate-spin" size={30} /><p className="mt-2 text-sm font-semibold">Creating your visual…</p></div></div>}{imageUrl && <div className="visual-overlay"><span><CheckCircle size={15} weight="fill" /> Ready</span></div>}</div><div className="image-controls"><label>Generated visual prompt <span>editable</span></label><textarea value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} rows={4} placeholder="Your structured visual prompt will appear here…" /><button onClick={generateImage} disabled={!!busy} className="secondary-action">{busy === "image" ? <SpinnerGap className="animate-spin" size={17} /> : <ArrowClockwise size={17} />} {imageUrl ? "Regenerate visual" : "Generate visual"}</button></div></div>}
            <div className="publish-zone"><div className="publish-copy"><span className="publish-label"><FacebookLogo size={15} weight="fill" /> READY TO PUBLISH</span><strong>{selectedPage.name}</strong><small>Choose text-only or image + caption.</small></div><div className="publish-buttons"><button className="publish-secondary" disabled={!canPublish} onClick={() => postNow(false)}>{busy === "text" ? <SpinnerGap className="animate-spin" size={17} /> : <ClipboardText size={17} />} Post text</button><button className="publish-primary" disabled={!canPublish || !imageUrl} onClick={() => postNow(true)}>{busy === "photo" ? <SpinnerGap className="animate-spin" size={17} /> : <CloudArrowUp size={17} weight="fill" />} Post with image</button></div></div>
          </section>
        </div>

        {status.text && <div className={`status-banner ${status.type}`} role="status">{statusIcon}<span>{status.text}</span>{status.type === "error" && <button onClick={() => setStatus({ type: "idle", text: "" })} aria-label="Dismiss"><X size={17} /></button>}</div>}

        {showSettings && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card"><div className="modal-header"><div><span className="eyebrow">STUDIO SETTINGS</span><h3>Creative defaults</h3></div><button className="icon-button" onClick={() => setShowSettings(false)}><X size={19} /></button></div><p className="mb-4 text-sm text-black/55">These settings control the current content session. Persistent brand assets and database storage come next.</p><div className="field-grid"><div className="field-group"><label>Default language</label><select value={language} onChange={(e) => setLanguage(e.target.value)}>{languages.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Default audience</label><select value={audience} onChange={(e) => setAudience(e.target.value)}>{audiences.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Visual style</label><select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)}>{visualStyles.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Aspect ratio</label><select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>{ratios.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Branding mode</label><select value={branding} onChange={(e) => setBranding(e.target.value)}>{brandingModes.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-group"><label>Logo position</label><select value={logoPosition} onChange={(e) => setLogoPosition(e.target.value)}>{logoPositions.map((item) => <option key={item}>{item}</option>)}</select></div></div><div className="mt-4 rounded-xl border border-black/8 bg-black/[0.025] p-3 text-xs text-black/55"><strong className="text-black/75">Brand assets:</strong> logo storage is intentionally not faked yet. Once Zawaago and InnoTech logos are supplied, we will connect them to R2 + database and apply them during final image processing.</div><button className="primary-action mt-4" onClick={() => setShowSettings(false)}>Save session settings</button></div></div>}

        {showHealth && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card"><div className="modal-header"><div><span className="eyebrow">SYSTEM</span><h3>Connection health</h3></div><button className="icon-button" onClick={() => setShowHealth(false)}><X size={19} /></button></div><div className="space-y-2 text-sm">{[["Workers AI", health?.aiConfigured], ["Facebook token", health?.facebookTokenConfigured], ["Zawaago Page", health?.zawaagoPageConfigured], ["InnoTech Page", health?.innotechPageConfigured], ["Image storage (R2)", health?.imageStorageConfigured]].map(([name, ok]) => <div key={String(name)} className="flex items-center justify-between rounded-xl border border-black/8 bg-white px-3 py-2"><span>{name}</span><span className={ok ? "text-green-700" : "text-amber-700"}>{ok ? "Connected" : "Not configured"}</span></div>)}</div><p className="mt-4 text-xs text-black/45">Graph API {health?.graphVersion || ""} · {health?.timestamp ? new Date(health.timestamp).toLocaleString() : ""}</p></div></div>}
      </div>
    </main>
  );
}
