import { useMemo, useState } from "react";
import { FilmStrip, Sparkle, Images, UploadSimple, Article } from "@phosphor-icons/react";

type SourceMode = "post" | "prompt" | "gallery" | "upload";
type BrandName = "None" | "Zawaago" | "InnoTech";

const SOURCE_OPTIONS: Array<{ id: SourceMode; label: string; icon: typeof Article }> = [
  { id: "post", label: "Post", icon: Article },
  { id: "prompt", label: "Prompt", icon: Sparkle },
  { id: "gallery", label: "Gallery", icon: Images },
  { id: "upload", label: "Upload", icon: UploadSimple },
];

const DURATION_OPTIONS = [15, 30, 45, 60];
const LANGUAGE_OPTIONS = ["English", "Hinglish", "Hindi", "Bengali", "Tamil", "Telugu", "Kannada", "Malayalam", "Marathi", "Gujarati", "Punjabi", "Odia"];

export default function ReelStudioV1() {
  const [source, setSource] = useState<SourceMode>("post");
  const [brand, setBrand] = useState<BrandName>("Zawaago");
  const [language, setLanguage] = useState("Hinglish");
  const [duration, setDuration] = useState(30);
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("Business Owners and Professionals");
  const [tone, setTone] = useState("Professional");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const sourceLabel = useMemo(() => SOURCE_OPTIONS.find((item) => item.id === source)?.label || "Post", [source]);

  return (
    <section className="reel-studio" aria-label="Reel Studio">
      <div className="reel-studio-head">
        <div>
          <div className="reel-studio-kicker"><FilmStrip size={16} /> REEL STUDIO</div>
          <h3>Create a professional AI Reel</h3>
          <p>Choose a source, define the creative direction, then build the Reel through the existing production pipeline.</p>
        </div>
        <span className="reel-manual">MANUAL CONTROL</span>
      </div>

      <div className="reel-engine-section">
        <div className="reel-engine-section-head">
          <strong>Create from</strong>
          <small>{sourceLabel} source selected</small>
        </div>
        <div className="reel-source-tabs" role="tablist" aria-label="Reel source">
          {SOURCE_OPTIONS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={source === id} className={source === id ? "active" : ""} onClick={() => setSource(id)}>
              <Icon size={17} /> {label}
            </button>
          ))}
        </div>
      </div>

      {source === "post" && (
        <div className="reel-engine-card">
          <strong>Use your latest generated Post</strong>
          <small>The existing Post → Reel flow will remain the production path. Scene 1 can reuse the post visual.</small>
        </div>
      )}

      {source === "prompt" && (
        <div className="reel-engine-card reel-engine-form">
          <label>What should this Reel be about?
            <textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. AI automation for small businesses" rows={3} />
          </label>
        </div>
      )}

      {source === "gallery" && (
        <div className="reel-engine-card">
          <strong>Select from Gallery</strong>
          <small>Gallery asset selection will be connected in the next asset phase. No R2 or Gallery behavior is changed in this phase.</small>
        </div>
      )}

      {source === "upload" && (
        <div className="reel-engine-card">
          <strong>Upload your own visual</strong>
          <small>R2 upload and My Uploads will be connected in the next asset phase.</small>
          <button type="button" className="reel-secondary-action" disabled><UploadSimple size={17} /> Upload asset · Phase 3</button>
        </div>
      )}

      <div className="reel-engine-controls">
        <label>Branding
          <select value={brand} onChange={(event) => setBrand(event.target.value as BrandName)}>
            <option>None</option><option>Zawaago</option><option>InnoTech</option>
          </select>
        </label>
        <label>Language
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>{LANGUAGE_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select>
        </label>
        <label>Target duration
          <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{DURATION_OPTIONS.map((item) => <option key={item} value={item}>{item} seconds</option>)}</select>
        </label>
        <label>Audience
          <input value={audience} onChange={(event) => setAudience(event.target.value)} />
        </label>
        <label>Tone
          <select value={tone} onChange={(event) => setTone(event.target.value)}><option>Professional</option><option>Educational</option><option>Conversational</option><option>Storytelling</option></select>
        </label>
      </div>

      <button type="button" className="reel-advanced-toggle" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)}>
        Advanced creative options <span>{advancedOpen ? "−" : "+"}</span>
      </button>
      {advancedOpen && (
        <div className="reel-engine-card reel-engine-form">
          <label>Hook<input placeholder="Optional opening hook" /></label>
          <label>CTA<input placeholder="Optional call to action" /></label>
          <label>Visual style<input placeholder="Premium Editorial Cinematic" /></label>
          <label>Keywords<input placeholder="Optional keywords" /></label>
          <label>Avoid topics<input placeholder="Optional exclusions" /></label>
        </div>
      )}

      <div className="reel-engine-summary" aria-live="polite">
        <span><b>{sourceLabel}</b> source</span><span><b>{brand}</b> branding</span><span><b>{language}</b></span><span><b>{duration}s</b> target</span>
      </div>

      <div className="reel-engine-note">Phase 2 UI foundation only · generation, Gallery, uploads and production actions remain unchanged until their dedicated phases.</div>
    </section>
  );
}
