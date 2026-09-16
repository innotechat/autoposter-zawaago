import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarCheck,
  CheckCircle,
  Copy,
  FilmStrip,
  Image as ImageIcon,
  Play,
  Sparkle,
  SpinnerGap,
  TextT,
  Trash,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";

type BrandName = "Zawaago" | "InnoTech" | "None" | "Custom";
type CreationMode = "sync" | "topic" | "upload";
type ReelLanguage = "English" | "Hinglish" | "Hindi" | "Bengali" | "Tamil" | "Telugu" | "Kannada" | "Malayalam" | "Marathi" | "Gujarati" | "Punjabi" | "Odia";
type Scene = { scene: number; durationSeconds: number; narration: string; caption: string; visualPrompt: string; imageUrl?: string };
type Storyboard = { title: string; hook: string; totalSeconds: number; scenes: Scene[]; pageName: string; language: ReelLanguage; audience: string };
type Creative = { pageName: "Zawaago" | "InnoTech"; topic: string; caption: string; imageUrl: string };

const LOGOS: Record<"Zawaago" | "InnoTech", string> = {
  Zawaago: "/brand/zawaago-logo-final.svg",
  InnoTech: "/brand/innotech-logo-final.svg",
};
const LANGUAGES: ReelLanguage[] = ["English", "Hinglish", "Hindi", "Bengali", "Tamil", "Telugu", "Kannada", "Malayalam", "Marathi", "Gujarati", "Punjabi", "Odia"];

function localDateTime(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.decoding = "async";
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Reel visual could not be decoded."));
    i.src = src;
  });
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, p: number) {
  const r = img.naturalWidth / img.naturalHeight, t = w / h;
  let sw = img.naturalWidth, sh = img.naturalHeight;
  if (r > t) sw = sh * t; else sh = sw / t;
  const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
  const z = 1.04 + Math.sin(p * Math.PI) * 0.035, dw = w * z, dh = h * z;
  ctx.drawImage(img, sx, sy, sw, sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawLogo(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, w: number) {
  if (!img) return;
  const lw = Math.round(w * 0.22);
  const lh = lw * (img.naturalHeight / (img.naturalWidth || 1));
  const pad = 10, bw = lw + pad * 2, bh = lh + pad * 2, x = w - bw - 22, y = 22;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,.93)";
  ctx.shadowColor = "rgba(0,0,0,.2)";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, 14);
  ctx.fill();
  ctx.restore();
  ctx.drawImage(img, x + pad, y + pad, lw, lh);
}

export default function ReelComposer() {
  const [creative, setCreative] = useState<Creative | null>(null);
  const [mode, setMode] = useState<CreationMode>("topic");
  const [customTopic, setCustomTopic] = useState("How AI Agents automate repetitive business workflows in 2026");
  const [branding, setBranding] = useState<BrandName>("None");
  const [customLogoUrl, setCustomLogoUrl] = useState<string>("");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);

  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [language, setLanguage] = useState<ReelLanguage>("Hinglish");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [savedVideoUrl, setSavedVideoUrl] = useState("");
  const [videoMime, setVideoMime] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [scheduleAt, setScheduleAt] = useState(localDateTime(new Date(Date.now() + 3600000)));
  const [scheduled, setScheduled] = useState(false);
  const [mp4Support, setMp4Support] = useState<boolean | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const pageName = branding === "InnoTech" ? "InnoTech" : branding === "Zawaago" ? "Zawaago" : "Zawaago";
  const ready = !!storyboard && storyboard.scenes.length === 5 && storyboard.scenes.every((s) => !!s.imageUrl);
  const minSchedule = useMemo(() => localDateTime(new Date(Date.now() + 60000)), []);
  const caption = storyboard?.scenes.map((s) => s.caption).join(" ") || (mode === "sync" ? creative?.caption : customTopic) || "";

  function loadCreative() {
    try {
      const raw = localStorage.getItem("autoposter:latest-creative");
      if (raw) {
        const parsed = JSON.parse(raw);
        setCreative(parsed);
      }
    } catch {
      setCreative(null);
    }
  }

  useEffect(() => {
    loadCreative();
    const timer = setInterval(loadCreative, 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setMp4Support(
      typeof MediaRecorder !== "undefined" &&
        ["video/mp4;codecs=avc1.424028,mp4a.40.2", "video/mp4"].some((x) => MediaRecorder.isTypeSupported(x))
    );
  }, []);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  function resetVideo() {
    setVideoUrl("");
    setSavedVideoUrl("");
    setVideoMime("");
  }

  function handleCustomImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = 5 - uploadedImages.length;
    const toProcess = Array.from(files).slice(0, remaining);
    toProcess.forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          setUploadedImages((prev) => (prev.length < 5 ? [...prev, dataUrl] : prev));
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function handleCustomLogo(file: File | null) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) setCustomLogoUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  async function storyboardCreate() {
    let effectiveTopic = customTopic.trim();
    let effectivePage = branding;
    let sourceCaption = "";

    if (mode === "sync") {
      if (!creative?.imageUrl) {
        setError("Generate a text + image post first to sync. Or switch to Topic Prompt mode to create directly.");
        return;
      }
      effectiveTopic = creative.topic || creative.caption.slice(0, 180);
      effectivePage = creative.pageName;
      sourceCaption = creative.caption;
    } else {
      if (!effectiveTopic) {
        setError("Please enter a topic prompt for the Reel storyboard.");
        return;
      }
    }

    setBusy("storyboard");
    setError("");
    setStatus(`Creating the five-scene Reel storyboard for "${effectiveTopic.slice(0, 40)}…"`);

    try {
      const r = await fetch("/api/reel-lab/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageName: effectivePage,
          language,
          topic: effectiveTopic,
          audience: "Business Owners and Professionals",
          sourceCaption,
        }),
      });
      const d: any = await r.json();
      if (!r.ok) throw new Error(d.details || d.error || "Storyboard generation failed");

      const next = d as Storyboard;
      if (mode === "sync" && creative?.imageUrl) {
        next.scenes = next.scenes.map((s, i) => (i === 0 ? { ...s, imageUrl: creative.imageUrl } : s));
      } else if (uploadedImages.length > 0) {
        next.scenes = next.scenes.map((s, i) => (uploadedImages[i] ? { ...s, imageUrl: uploadedImages[i] } : s));
      }

      setStoryboard(next);
      resetVideo();
      setAudioUrl("");
      setStatus(`Storyboard ready in ${language}. ${next.scenes.filter((s) => s.imageUrl).length}/5 visuals assigned.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function visuals() {
    if (!storyboard) return;
    setBusy("assets");
    setError("");

    try {
      for (let i = 0; i < storyboard.scenes.length; i++) {
        const current = storyboard.scenes[i];
        if (current.imageUrl) continue;
        setStatus(`Generating Reel visual for Scene ${i + 1}/5…`);
        const r = await fetch("/api/autoposter/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageName: branding === "None" ? "Zawaago" : pageName,
            topic: `${storyboard.title} · scene ${current.scene}`,
            contentType: "Educational Reel Scene",
            tone: `Professional ${language}`,
            language,
            audience: "Business Owners and Professionals",
            visualStyle: "Premium Editorial Cinematic",
            aspectRatio: "Portrait 9:16",
            branding: "No branding",
            logoPosition: "Bottom Right",
            cta: "None",
            customPrompt: `${current.visualPrompt} Clean artwork only. No text, logos, letters, numbers, subtitles or watermarks. Designed for a vertical 9:16 educational Reel.`,
            imgPrompt: current.visualPrompt,
          }),
        });
        const d: any = await r.json();
        if (!r.ok || !d.imageUrl) throw new Error(d.details || d.error || `Scene ${i + 1} visual generation failed`);
        setStoryboard((cur) =>
          cur ? { ...cur, scenes: cur.scenes.map((s) => (s.scene === current.scene ? { ...s, imageUrl: d.imageUrl } : s)) } : cur
        );
      }
      setStatus("All five Reel visuals are ready. Click Create Reel Video when ready to render.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function getAudioUrl() {
    if (audioUrl) {
      setStatus(`Using completed ${language} voice — skipping TTS.`);
      return audioUrl;
    }
    if (!storyboard) throw new Error("Storyboard is missing.");
    setStatus(`Generating ${language} voice with ${language === "English" ? "MeloTTS" : "Sarvam"}…`);
    const narration = storyboard.scenes.map((s) => s.narration).join(" ");
    const r = await fetch("/api/reel-lab/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: narration, language, speaker: "shubh" }),
    });
    if (!r.ok) {
      const d: any = await r.json().catch(() => ({}));
      throw new Error(d.details || d.error || "Voice generation failed");
    }
    const url = URL.createObjectURL(await r.blob());
    setAudioUrl(url);
    setStatus("Voice generation complete. Rendering video…");
    return url;
  }

  async function render() {
    if (!storyboard || !ready) return;
    if (mp4Support !== true) {
      setError("This browser cannot produce a production MP4 with MediaRecorder. Use Chrome or modern Edge.");
      return;
    }
    setBusy("render");
    setError("");

    try {
      const sourceAudioUrl = await getAudioUrl();
      const audio = new Audio(sourceAudioUrl);
      await new Promise<void>((resolve, reject) => {
        audio.onloadedmetadata = () => resolve();
        audio.onerror = () => reject(new Error("Generated voice could not be decoded."));
      });

      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas is unavailable.");
      const w = 540,
        h = 960;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas rendering context is unavailable.");

      let logoImg: HTMLImageElement | null = null;
      if (branding === "Zawaago" || branding === "InnoTech") {
        logoImg = await loadImage(LOGOS[branding]);
      } else if (branding === "Custom" && customLogoUrl) {
        logoImg = await loadImage(customLogoUrl);
      }

      const imgs = await Promise.all(storyboard.scenes.map((s) => loadImage(s.imageUrl!)));

      const vs = canvas.captureStream(30);
      const ac = new AudioContext();
      const src = ac.createMediaElementSource(audio);
      const dest = ac.createMediaStreamDestination();
      src.connect(dest);
      src.connect(ac.destination);
      const stream = new MediaStream([...vs.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const mime = ["video/mp4;codecs=avc1.424028,mp4a.40.2", "video/mp4"].find((x) => MediaRecorder.isTypeSupported(x));
      if (!mime) throw new Error("Production MP4 is not supported by this browser.");

      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000, audioBitsPerSecond: 128000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const done = new Promise<void>((resolve, reject) => {
        rec.onstop = () => resolve();
        rec.onerror = () => reject(new Error("Browser video recording failed."));
      });

      rec.start(250);
      await audio.play();

      const starts: number[] = [];
      let cursor = 0;
      storyboard.scenes.forEach((s) => {
        starts.push(cursor);
        cursor += s.durationSeconds;
      });
      const duration = Math.max(cursor, Number.isFinite(audio.duration) ? audio.duration + 0.25 : cursor);
      const started = performance.now();

      const draw = () => {
        const elapsed = (performance.now() - started) / 1000;
        let i = storyboard.scenes.findIndex((_, n) => elapsed >= starts[n] && elapsed < starts[n] + storyboard.scenes[n].durationSeconds);
        if (i < 0) i = storyboard.scenes.length - 1;
        const s = storyboard.scenes[i];

        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, w, h);
        cover(ctx, imgs[i], w, h, Math.max(0, Math.min(1, (elapsed - starts[i]) / s.durationSeconds)));

        const g = ctx.createLinearGradient(0, h * 0.48, 0, h);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.48, "rgba(0,0,0,.18)");
        g.addColorStop(1, "rgba(0,0,0,.88)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        if (logoImg) {
          drawLogo(ctx, logoImg, w);
        }

        ctx.fillStyle = "rgba(255,255,255,.82)";
        ctx.font = "700 13px system-ui,sans-serif";
        ctx.fillText(`${i + 1}/5`, 24, 42);
        ctx.font = "700 27px system-ui,sans-serif";

        const lines = wrap(ctx, s.caption, w - 48),
          lh = 35,
          bh = lines.length * lh + 30,
          by = h - bh - 36;
        ctx.fillStyle = "rgba(0,0,0,.34)";
        ctx.beginPath();
        ctx.roundRect(18, by - 12, w - 36, bh, 18);
        ctx.fill();
        ctx.fillStyle = "#fff";
        lines.forEach((line, n) => ctx.fillText(line, 32, by + 20 + n * lh));

        if (elapsed < duration) {
          requestAnimationFrame(draw);
        } else {
          audio.pause();
          rec.stop();
          stream.getTracks().forEach((t) => t.stop());
          void ac.close();
        }
      };

      requestAnimationFrame(draw);
      await done;

      const out = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(out);
      setVideoUrl(url);
      setVideoMime(mime);
      setStatus("Reel created. Saving the production MP4 to Cloudflare R2…");
      await save(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function save(blob: Blob) {
    setBusy("save");
    const form = new FormData();
    form.set("pageName", branding === "None" ? "None" : branding === "Custom" ? "Custom" : pageName);
    form.set("caption", caption);
    const prefix = branding === "None" ? "reel" : pageName.toLowerCase();
    form.set("file", new File([blob], `${prefix}-${Date.now()}.mp4`, { type: "video/mp4" }));

    const r = await fetch("/api/reel-lab/assets", { method: "POST", body: form });
    const d: any = await r.json();
    if (!r.ok || !d.videoUrl) throw new Error(d.details || d.error || "Could not save Reel to R2.");
    setSavedVideoUrl(d.videoUrl);
    setStatus("Production MP4 saved to Cloudflare R2. Ready to download, preview or publish.");
  }

  async function saveExisting() {
    if (!videoUrl) return;
    setBusy("save");
    setError("");
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      await save(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!savedVideoUrl || !storyboard) return;
    if (!confirm(`Publish this Reel now to the ${pageName} Facebook Page?`)) return;
    setBusy("publish");
    setError("");
    try {
      const r = await fetch("/api/autoposter/reels/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageName, videoUrl: savedVideoUrl, title: storyboard.title, caption }),
      });
      const d: any = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.details || d.error || "Facebook Reel publishing failed.");
      setStatus(`Facebook Reel published successfully · video ${d.videoId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function schedule() {
    if (!savedVideoUrl || !storyboard) return;
    const d = new Date(scheduleAt);
    if (!Number.isFinite(d.getTime()) || d.getTime() <= Date.now() + 30000) {
      setError("Schedule time must be at least 30 seconds in the future.");
      return;
    }
    setBusy("schedule");
    setError("");
    try {
      const r = await fetch("/api/autoposter/schedules/reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageName, videoUrl: savedVideoUrl, title: storyboard.title, caption, scheduledAt: d.toISOString() }),
      });
      const x: any = await r.json();
      if (!r.ok || !x.ok) throw new Error(x.details || x.error || "Facebook Reel scheduling failed.");
      setScheduled(true);
      setStatus(`Reel scheduled for ${d.toLocaleString()} · ${pageName}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function copyR2Link() {
    if (!savedVideoUrl) return;
    navigator.clipboard.writeText(savedVideoUrl);
    setStatus("R2 asset URL copied to clipboard.");
  }

  const disabled = !!busy;

  return (
    <section className="reel-studio">
      <canvas ref={canvasRef} hidden />

      <header className="reel-studio-head">
        <div>
          <div className="eyebrow">
            <FilmStrip size={15} /> REEL ENGINE UTILITY
          </div>
          <h3>Standalone AI Reel Studio</h3>
          <p>Create high-converting vertical 9:16 Reels via Topic Prompt, Image Upload, or Autoposter Sync.</p>
        </div>
        <span className="reel-manual">STANDALONE ENGINE</span>
      </header>

      {/* Creation Mode Segmented Tabs */}
      <div className="reel-mode-tabs">
        <button
          type="button"
          className={`reel-mode-tab ${mode === "topic" ? "active" : ""}`}
          onClick={() => {
            setMode("topic");
            setStoryboard(null);
            resetVideo();
          }}
        >
          <Sparkle size={15} /> Topic Prompt
        </button>
        <button
          type="button"
          className={`reel-mode-tab ${mode === "upload" ? "active" : ""}`}
          onClick={() => {
            setMode("upload");
            setStoryboard(null);
            resetVideo();
          }}
        >
          <UploadSimple size={15} /> Upload Images
        </button>
        <button
          type="button"
          className={`reel-mode-tab ${mode === "sync" ? "active" : ""}`}
          onClick={() => {
            setMode("sync");
            setStoryboard(null);
            resetVideo();
          }}
        >
          <FilmStrip size={15} /> Sync Post Creative
        </button>
      </div>

      {/* Mode 1: Topic Prompt */}
      {mode === "topic" && (
        <div className="reel-standalone-box">
          <label>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <TextT size={15} /> Reel Topic or Script Concept
            </span>
            <textarea
              className="reel-topic-textarea"
              placeholder="Enter what this Reel should explain, teach or demonstrate…"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              disabled={disabled}
            />
          </label>
        </div>
      )}

      {/* Mode 2: Custom Images Upload */}
      {mode === "upload" && (
        <div className="reel-upload-container">
          <input
            type="file"
            ref={fileInputRef}
            hidden
            multiple
            accept="image/*"
            onChange={(e) => handleCustomImages(e.target.files)}
          />
          <label>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 750, color: "#353535" }}>
              <TextT size={15} /> Reel Topic (Context for voice & script)
            </span>
            <input
              type="text"
              style={{
                width: "100%",
                minHeight: "38px",
                border: "1px solid #deddd9",
                borderRadius: "8px",
                padding: "0 10px",
                fontSize: "12px",
                marginTop: "4px",
                marginBottom: "8px",
              }}
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="e.g. 5 AI productivity tips for businesses"
            />
          </label>
          <div className="reel-upload-dropzone" onClick={() => fileInputRef.current?.click()}>
            <ImageIcon size={26} style={{ color: "#77746e" }} />
            <div>
              <strong>Click to upload custom scene images</strong>
              <small className="block">Upload 1 to 5 images (9:16 vertical recommended). Missing scenes will be generated by AI.</small>
            </div>
          </div>
          {uploadedImages.length > 0 && (
            <div className="reel-upload-grid">
              {uploadedImages.map((img, idx) => (
                <div key={idx} className="reel-upload-thumb">
                  <img src={img} alt={`Upload ${idx + 1}`} />
                  <span className="reel-upload-thumb-badge">Scene {idx + 1}</span>
                  <button
                    type="button"
                    className="reel-upload-thumb-remove"
                    onClick={() => setUploadedImages((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mode 3: Post Creative Sync */}
      {mode === "sync" && (
        <div className="reel-source">
          {creative?.imageUrl ? (
            <>
              <img src={creative.imageUrl} alt="Current post visual" />
              <div>
                <strong>{creative.pageName}</strong>
                <b>{creative.topic || "Current generated post"}</b>
                <small>Scene 1 reuses this approved post visual.</small>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <FilmStrip size={22} style={{ color: "#8c8a84", flexShrink: 0 }} />
              <div>
                <strong>Generate the post first</strong>
                <small>The Reel Composer reuses the current Studio post image as Scene 1.</small>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Brand & Watermark Selector */}
      <div className="reel-brand-selector">
        <div className="reel-brand-selector-head">
          <span>Watermark & Brand Tag</span>
          <small style={{ color: "#8c8a84" }}>
            {branding === "None" ? "Clean unbranded video" : branding === "Custom" ? "Custom logo watermark" : `${branding} official badge`}
          </small>
        </div>
        <div className="reel-brand-pills">
          <button
            type="button"
            className={`reel-brand-pill ${branding === "None" ? "selected" : ""}`}
            onClick={() => setBranding("None")}
          >
            🚫 No branding (Clean)
          </button>
          <button
            type="button"
            className={`reel-brand-pill ${branding === "Zawaago" ? "selected" : ""}`}
            onClick={() => setBranding("Zawaago")}
          >
            Zawaago
          </button>
          <button
            type="button"
            className={`reel-brand-pill ${branding === "InnoTech" ? "selected" : ""}`}
            onClick={() => setBranding("InnoTech")}
          >
            InnoTech
          </button>
          <button
            type="button"
            className={`reel-brand-pill ${branding === "Custom" ? "selected" : ""}`}
            onClick={() => {
              setBranding("Custom");
              if (!customLogoUrl) logoInputRef.current?.click();
            }}
          >
            ⭐ Custom Logo
          </button>
        </div>

        {branding === "Custom" && (
          <div className="reel-custom-logo-upload">
            <input
              type="file"
              ref={logoInputRef}
              hidden
              accept="image/png,image/svg+xml,image/webp,image/jpeg"
              onChange={(e) => handleCustomLogo(e.target.files?.[0] || null)}
            />
            {customLogoUrl ? (
              <>
                <img src={customLogoUrl} alt="Custom Logo" />
                <span style={{ color: "#1e6d4e", fontWeight: 700 }}>Custom Logo Loaded</span>
                <button
                  type="button"
                  style={{ marginLeft: "auto", border: "none", background: "transparent", color: "#888", cursor: "pointer" }}
                  onClick={() => logoInputRef.current?.click()}
                >
                  Replace
                </button>
              </>
            ) : (
              <button
                type="button"
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid #d5d3ce",
                  background: "#fafaf9",
                  cursor: "pointer",
                  fontWeight: 650,
                }}
                onClick={() => logoInputRef.current?.click()}
              >
                Upload PNG/SVG Logo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Language & MP4 Compatibility */}
      <div className="reel-controls">
        <label>
          Voice / narration language
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value as ReelLanguage);
              setStoryboard(null);
              resetVideo();
              setAudioUrl("");
              setScheduled(false);
            }}
            disabled={disabled}
          >
            {LANGUAGES.map((x) => (
              <option key={x} value={x}>
                {x}
                {x === "English" ? " · MeloTTS" : " · Sarvam"}
              </option>
            ))}
          </select>
        </label>
        <div className={`mp4-check ${mp4Support === true ? "ok" : mp4Support === false ? "bad" : ""}`}>
          {mp4Support === true ? (
            <>
              <CheckCircle size={15} /> Production MP4 supported
            </>
          ) : mp4Support === false ? (
            <>
              <WarningCircle size={15} /> MP4 recording unsupported in this browser
            </>
          ) : (
            "Checking MP4 recorder support…"
          )}
        </div>
      </div>

      {/* Step Actions */}
      <div className="reel-steps">
        <button disabled={disabled || (mode === "sync" && !creative?.imageUrl)} onClick={() => void storyboardCreate()}>
          ✨ Create Reel Storyboard
        </button>
        <button disabled={disabled || !storyboard} onClick={() => void visuals()}>
          🎨 Generate 4 Remaining Visuals
        </button>
        <button disabled={disabled || !ready || mp4Support !== true} onClick={() => void render()}>
          <Play size={17} />
          {busy === "render" || busy === "save" ? <SpinnerGap className="spin" /> : "Create Reel Video"}
        </button>
      </div>

      {status && (
        <div className="reel-status success">
          <CheckCircle size={17} />
          {status}
        </div>
      )}
      {error && (
        <div className="reel-status error">
          <WarningCircle size={17} />
          {error}
        </div>
      )}

      {/* Storyboard Card */}
      {storyboard && (
        <div className="reel-storyboard">
          <div className="reel-story-head">
            <div>
              <strong>{storyboard.title}</strong>
              <small>
                {storyboard.hook} · {storyboard.totalSeconds}s · {storyboard.language}
                {audioUrl ? " · voice ready" : ""} · {branding === "None" ? "Unbranded" : branding}
              </small>
            </div>
            <b>{storyboard.scenes.filter((s) => s.imageUrl).length}/5 visuals ready</b>
          </div>
          <div className="reel-scenes">
            {storyboard.scenes.map((s) => (
              <div key={s.scene}>
                <div className="scene-thumb">
                  {s.imageUrl ? <img src={s.imageUrl} alt={`Scene ${s.scene}`} /> : <span>Pending</span>}
                </div>
                <small>Scene {s.scene}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reel Video Preview + Download + R2 */}
      {videoUrl && (
        <div className="reel-preview">
          <div className="reel-preview-head">
            <div>
              <strong>▶ Reel Video Preview</strong>
              <small>{videoMime}</small>
            </div>
            {savedVideoUrl && <span>R2 SAVED</span>}
          </div>
          <video src={videoUrl} controls playsInline preload="metadata" />

          {savedVideoUrl && (
            <div className="reel-r2-meta">
              <span>Cloudflare R2 Asset:</span>
              <code>{savedVideoUrl}</code>
              <button
                type="button"
                className="reel-copy-btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid #cfe9dd",
                  background: "#fff",
                  color: "#1e6d4e",
                  cursor: "pointer",
                  fontSize: "10px",
                  fontWeight: 700,
                }}
                onClick={copyR2Link}
              >
                <Copy size={13} /> Copy Link
              </button>
            </div>
          )}

          <div className="reel-actions">
            <a href={videoUrl} download={`${pageName.toLowerCase()}-reel.mp4`}>
              ⬇ Download MP4
            </a>
            {!savedVideoUrl && (
              <button disabled={disabled} onClick={() => void saveExisting()}>
                Save MP4 to R2
              </button>
            )}
            {savedVideoUrl && (
              <a href={savedVideoUrl} target="_blank" rel="noreferrer">
                Open saved asset ↗
              </a>
            )}
          </div>
        </div>
      )}

      {/* Publish or Schedule via Facebook if Brand is selected */}
      {savedVideoUrl && !scheduled && branding !== "None" && (
        <div className="reel-publish">
          <div>
            <strong>Publish / Schedule to Facebook</strong>
            <small>R2 keeps the production MP4 permanently available for Meta Graph API publishing.</small>
          </div>
          <label>
            Schedule date & time
            <input type="datetime-local" min={minSchedule} value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          </label>
          <div className="reel-publish-actions">
            <button disabled={disabled} onClick={() => void schedule()}>
              <CalendarCheck size={17} />
              {busy === "schedule" ? <SpinnerGap className="spin" /> : "Schedule Reel"}
            </button>
            <button disabled={disabled} onClick={() => void publish()}>
              🚀 Publish to Facebook
            </button>
          </div>
        </div>
      )}

      {scheduled && (
        <div className="reel-status success">
          <CalendarCheck size={17} /> Queued successfully. Check Schedule tab for publishing status.
        </div>
      )}
    </section>
  );
}
