import { useState } from "react";
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

const contentTypes = [
  "AI Agents & Automation",
  "AI Apps & Tools",
  "Business Consulting",
  "Innovation Strategy",
  "AI News & Insights",
  "Founder Productivity",
  "Case Study",
];

const tones = [
  "Professional Hinglish",
  "Professional English",
  "Viral Hook",
  "Storytelling",
  "Technical Deep Dive",
];

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("FB_TOKEN")) return "Facebook connection is not configured yet. Add the Page credentials in Cloudflare before publishing.";
  if (message.includes("Page ID")) return message;
  if (message.includes("Failed to fetch")) return "The server could not be reached. Check the deployment and try again.";
  return message || "Something went wrong. Please try again.";
}

export default function Autoposter() {
  const [page, setPage] = useState("Zawaago");
  const [topic, setTopic] = useState("How AI Agents save time for business owners");
  const [contentType, setContentType] = useState(contentTypes[0]);
  const [tone, setTone] = useState(tones[0]);
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [busy, setBusy] = useState<"generate" | "image" | "text" | "photo" | "health" | null>(null);
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error" | "info"; text: string }>({ type: "idle", text: "" });
  const [health, setHealth] = useState<any>(null);
  const [showHealth, setShowHealth] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"caption" | "image">("caption");

  const selectedPage = pages.find((item) => item.id === page) ?? pages[0];
  const canPublish = caption.trim().length > 0 && !busy;

  async function generate() {
    if (!topic.trim()) {
      setStatus({ type: "error", text: "Add a topic first so the AI knows what to create." });
      return;
    }
    setBusy("generate");
    setStatus({ type: "info", text: "Building your post… analysing topic, tone and page voice." });
    try {
      const res = await fetch("/api/autoposter/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageName: page, topic, contentType, tone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Generation failed");
      setCaption(data.caption || "");
      setImageUrl(data.imageUrl || "");
      setImagePrompt(`Professional editorial visual for ${page}: ${topic}`);
      setActiveTab("caption");
      setStatus({ type: "success", text: "Draft ready. Review it, edit anything you like, then publish." });
    } catch (error) {
      setStatus({ type: "error", text: friendlyError(error) });
    } finally {
      setBusy(null);
    }
  }

  async function generateImage() {
    if (!topic.trim()) {
      setStatus({ type: "error", text: "Add a topic before generating an image." });
      return;
    }
    setBusy("image");
    setStatus({ type: "info", text: "Creating the visual… this can take a few seconds." });
    try {
      const res = await fetch("/api/autoposter/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, imgPrompt: imagePrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Image generation failed");
      setImageUrl(data.imageUrl || "");
      setActiveTab("image");
      setStatus({ type: "success", text: "Visual generated. You can replace it or publish the current draft." });
    } catch (error) {
      setStatus({ type: "error", text: friendlyError(error) });
    } finally {
      setBusy(null);
    }
  }

  async function postNow(withImage = false) {
    if (!caption.trim()) {
      setStatus({ type: "error", text: "Write or generate a caption before publishing." });
      return;
    }
    if (withImage && !imageUrl) {
      setStatus({ type: "error", text: "Generate or add an image before publishing a photo post." });
      return;
    }
    setBusy(withImage ? "photo" : "text");
    setStatus({ type: "info", text: withImage ? `Publishing image to ${selectedPage.name}…` : `Publishing text to ${selectedPage.name}…` });
    try {
      const res = await fetch("/api/autoposter/post-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, caption, imageUrl, withImage }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.details || data.error || "Facebook post failed");
      setStatus({ type: "success", text: `Published successfully to ${selectedPage.name}. Post ID: ${data.id || "accepted"}` });
    } catch (error) {
      setStatus({ type: "error", text: friendlyError(error) });
    } finally {
      setBusy(null);
    }
  }

  async function checkHealth() {
    setBusy("health");
    setStatus({ type: "info", text: "Checking AI and publishing services…" });
    try {
      const res = await fetch("/api/autoposter/health");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Health check failed");
      setHealth(data);
      setShowHealth(true);
      setStatus({ type: "success", text: "System check completed." });
    } catch (error) {
      setStatus({ type: "error", text: friendlyError(error) });
    } finally {
      setBusy(null);
    }
  }

  async function copyCaption() {
    if (!caption) return;
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setStatus({ type: "success", text: "Caption copied to clipboard." });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setStatus({ type: "error", text: "Clipboard access was blocked by the browser." });
    }
  }

  function clearDraft() {
    setCaption("");
    setImageUrl("");
    setImagePrompt("");
    setStatus({ type: "info", text: "Draft cleared. Your topic and settings are kept." });
  }

  const statusIcon = status.type === "success" ? <CheckCircle size={19} weight="fill" /> : status.type === "error" ? <WarningCircle size={19} weight="fill" /> : <Pulse size={19} />;

  return (
    <main className="autoposter-shell min-h-screen text-[#171717]">
      <div className="mx-auto w-full max-w-[1380px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <header className="studio-header">
          <div className="flex min-w-0 items-center gap-3">
            <div className="brand-mark">Z</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[18px] font-semibold tracking-[-0.03em] sm:text-[20px]">Zawaago Autoposter</h1>
                <span className="status-pill"><span className="live-dot" /> Live</span>
              </div>
              <p className="mt-0.5 hidden text-[12px] text-[#777] sm:block">Social Content Studio · create, refine, publish</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="icon-button" title="System health" onClick={checkHealth} disabled={!!busy}>
              {busy === "health" ? <SpinnerGap className="animate-spin" size={19} /> : <Pulse size={19} />}
              <span className="hidden sm:inline">Health</span>
            </button>
            <button className="icon-button" title="Settings"><GearSix size={19} /><span className="hidden sm:inline">Settings</span></button>
          </div>
        </header>

        <section className="hero-strip">
          <div>
            <div className="eyebrow"><Sparkle size={14} weight="fill" /> CONTENT STUDIO</div>
            <h2>Create something worth stopping for.</h2>
            <p>Choose a brand voice, shape the idea, then review the finished post before it reaches Facebook.</p>
          </div>
          <div className="hero-stat hidden md:flex"><span>2</span><small>brands<br />connected</small></div>
        </section>

        <div className="workspace-grid">
          <section className="panel composer-panel">
            <div className="panel-heading">
              <div><span className="section-number">01</span><h3>Build the brief</h3></div>
              <span className="muted-label">AI-assisted</span>
            </div>

            <div className="field-group">
              <label>Publish as</label>
              <div className="page-switcher">
                {pages.map((item) => (
                  <button key={item.id} type="button" onClick={() => setPage(item.id)} className={`page-option ${page === item.id ? "selected" : ""}`}>
                    <span className={`page-avatar ${item.id === "InnoTech" ? "alt" : ""}`}>{item.mark}</span>
                    <span className="page-copy"><strong>{item.name}</strong><small>{item.handle}</small></span>
                    {page === item.id && <CheckCircle className="ml-auto" size={19} weight="fill" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-grid">
              <div className="field-group">
                <label>Content direction</label>
                <select value={contentType} onChange={(e) => setContentType(e.target.value)}>{contentTypes.map((item) => <option key={item}>{item}</option>)}</select>
              </div>
              <div className="field-group">
                <label>Voice & tone</label>
                <select value={tone} onChange={(e) => setTone(e.target.value)}>{tones.map((item) => <option key={item}>{item}</option>)}</select>
              </div>
            </div>

            <div className="field-group">
              <div className="flex items-center justify-between"><label>Core idea</label><span className="field-hint">What should people remember?</span></div>
              <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={5} placeholder="Describe the idea, problem, launch, insight or story…" />
            </div>

            <button type="button" onClick={generate} disabled={!!busy} className="primary-action">
              {busy === "generate" ? <><SpinnerGap className="animate-spin" size={19} /> Creating draft…</> : <><MagicWand size={19} weight="fill" /> Generate post</>}
            </button>
            <p className="micro-note"><span className="tiny-shield" /> Your draft stays editable until you choose to publish.</p>
          </section>

          <section className="panel preview-panel">
            <div className="panel-heading preview-heading">
              <div><span className="section-number">02</span><h3>Review & refine</h3></div>
              <div className="preview-actions">
                <button className="small-action" onClick={copyCaption} disabled={!caption}>{copied ? <CheckCircle size={16} weight="fill" /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}</button>
                <button className="small-action danger" onClick={clearDraft} disabled={!caption && !imageUrl}><Trash size={16} /> Clear</button>
              </div>
            </div>

            <div className="preview-tabs">
              <button className={activeTab === "caption" ? "active" : ""} onClick={() => setActiveTab("caption")}><PencilSimple size={16} /> Caption</button>
              <button className={activeTab === "image" ? "active" : ""} onClick={() => setActiveTab("image")}><ImageSquare size={16} /> Visual</button>
            </div>

            {activeTab === "caption" ? (
              <div className="editor-card">
                <div className="editor-toolbar"><span>{selectedPage.name} · Facebook post</span><span>{caption.length} characters</span></div>
                <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Your generated post will appear here. You can edit every word before publishing." className="caption-editor" />
                <div className="editor-footer"><span>Direct editing enabled</span><button onClick={() => setActiveTab("image")} className="text-link">Review visual <span>→</span></button></div>
              </div>
            ) : (
              <div className="visual-editor">
                <div className="visual-frame">
                  {imageUrl ? <img src={imageUrl} alt="Generated social visual" /> : <div className="visual-empty"><ImageSquare size={38} /><strong>No visual yet</strong><span>Generate an image for this post.</span></div>}
                  {imageUrl && <div className="visual-overlay"><span><CheckCircle size={15} weight="fill" /> Ready</span></div>}
                </div>
                <div className="image-controls">
                  <label>Visual direction <span>optional</span></label>
                  <input value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder="e.g. premium editorial illustration, founder at work…" />
                  <button onClick={generateImage} disabled={!!busy} className="secondary-action">{busy === "image" ? <SpinnerGap className="animate-spin" size={17} /> : <ArrowClockwise size={17} />} {imageUrl ? "Regenerate visual" : "Generate visual"}</button>
                </div>
              </div>
            )}

            <div className="publish-zone">
              <div className="publish-copy"><span className="publish-label"><FacebookLogo size={15} weight="fill" /> READY TO PUBLISH</span><strong>{selectedPage.name}</strong><small>Choose text-only or image + caption.</small></div>
              <div className="publish-buttons">
                <button className="publish-secondary" disabled={!canPublish} onClick={() => postNow(false)}>{busy === "text" ? <SpinnerGap className="animate-spin" size={17} /> : <ClipboardText size={17} />} Post text</button>
                <button className="publish-primary" disabled={!canPublish || !imageUrl} onClick={() => postNow(true)}>{busy === "photo" ? <SpinnerGap className="animate-spin" size={17} /> : <CloudArrowUp size={17} weight="fill" />} Post with image</button>
              </div>
            </div>
          </section>
        </div>

        {status.text && <div className={`status-banner ${status.type}`} role="status">{statusIcon}<span>{status.text}</span>{status.type === "error" && <button onClick={() => setStatus({ type: "idle", text: "" })}><X size={17} /></button>}</div>}

        <footer className="studio-footer">
          <span><span className="live-dot" /> Connected to Cloudflare Workers</span>
          <span>AI content generation · Facebook publishing</span>
        </footer>
      </div>

      {showHealth && health && (
        <div className="modal-backdrop" onClick={() => setShowHealth(false)}>
          <div className="health-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><div><span className="eyebrow">SYSTEM CHECK</span><h3>Service health</h3></div><button className="modal-close" onClick={() => setShowHealth(false)}><X size={19} /></button></div>
            <div className="health-grid">
              {[
                ["AI engine", health.aiConfigured],
                ["Facebook token", health.facebookTokenConfigured],
                ["Zawaago Page", health.zawaagoPageConfigured],
                ["InnoTech Page", health.innotechPageConfigured],
              ].map(([label, value]) => <div className="health-item" key={String(label)}><span>{value ? <CheckCircle size={18} weight="fill" /> : <WarningCircle size={18} weight="fill" />}</span><div><strong>{label}</strong><small>{value ? "Configured" : "Not configured"}</small></div></div>)}
            </div>
            <div className="health-meta">Graph API {health.graphVersion} · {health.mode} mode</div>
          </div>
        </div>
      )}
    </main>
  );
}
