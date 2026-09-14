import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck, CheckCircle, FilmStrip, Play, SpinnerGap, WarningCircle } from "@phosphor-icons/react";

type BrandName = "Zawaago" | "InnoTech";
type Scene = { scene: number; durationSeconds: number; narration: string; caption: string; visualPrompt: string; imageUrl?: string };
type Storyboard = { title: string; hook: string; totalSeconds: number; scenes: Scene[]; pageName: string; language: string; audience: string };
type CreativeSnapshot = { pageName: BrandName; topic: string; caption: string; imageUrl: string; imagePrompt?: string };

const LOGOS: Record<BrandName, string> = {
  Zawaago: "/brand/zawaago-logo-final.svg",
  InnoTech: "/brand/innotech-logo-final.svg",
};
const PAGE_IDS: Record<BrandName, string> = {
  Zawaago: "113167943749510",
  InnoTech: "102440764818837",
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Reel visual could not be decoded."));
    image.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number, progress: number) {
  const ratio = image.naturalWidth / image.naturalHeight;
  const target = width / height;
  let sw = image.naturalWidth;
  let sh = image.naturalHeight;
  if (ratio > target) sw = sh * target;
  else sh = sw / target;
  const sx = (image.naturalWidth - sw) / 2;
  const sy = (image.naturalHeight - sh) / 2;
  const zoom = 1.04 + Math.sin(progress * Math.PI) * 0.035;
  const dw = width * zoom;
  const dh = height * zoom;
  ctx.drawImage(image, sx, sy, sw, sh, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

function drawBrandMark(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, width: number) {
  const logoW = Math.round(width * 0.22);
  const logoH = logoW * (logo.naturalHeight / logo.naturalWidth);
  const pad = Math.max(8, Math.round(width * 0.018));
  const badgeW = logoW + pad * 2;
  const badgeH = logoH + pad * 2;
  const x = width - badgeW - 22;
  const y = 22;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.22)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.beginPath();
  ctx.roundRect(x, y, badgeW, badgeH, Math.round(pad * 1.35));
  ctx.fill();
  ctx.restore();
  ctx.drawImage(logo, x + pad, y + pad, logoW, logoH);
}

function localDateTime(date: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

export default function ReelComposer() {
  const [creative, setCreative] = useState<CreativeSnapshot | null>(null);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [busy, setBusy] = useState<"storyboard" | "assets" | "render" | "save" | "publish" | "schedule" | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoMime, setVideoMime] = useState("");
  const [savedVideoUrl, setSavedVideoUrl] = useState("");
  const [scheduleAt, setScheduleAt] = useState(() => localDateTime(new Date(Date.now() + 60 * 60 * 1000)));
  const [scheduled, setScheduled] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageName = creative?.pageName || "Zawaago";
  const topic = creative?.topic || "";
  const language = "Hinglish";
  const readyForRender = !!storyboard && storyboard.scenes.length === 5 && storyboard.scenes.every((scene) => !!scene.imageUrl);
  const minSchedule = useMemo(() => localDateTime(new Date(Date.now() + 60_000)), []);
  const caption = storyboard?.scenes.map((scene) => scene.caption).join(" ") || creative?.caption || "";

  function loadCreative() {
    try {
      const raw = localStorage.getItem("autoposter:latest-creative");
      if (raw) setCreative(JSON.parse(raw));
    } catch {
      setCreative(null);
    }
  }

  useEffect(() => {
    loadCreative();
    const onStorage = () => loadCreative();
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(loadCreative, 1200);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, []);

  async function createStoryboard() {
    if (!creative?.imageUrl) {
      setError("Generate a text + image post first. The Reel reuses that post visual as Scene 1.");
      return;
    }
    setBusy("storyboard");
    setError("");
    setVideoUrl("");
    setSavedVideoUrl("");
    setScheduled(false);
    setStatus("Creating the five-scene Reel storyboard…");
    try {
      const response = await fetch("/api/reel-lab/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageName,
          language,
          topic: topic || creative.caption.slice(0, 180),
          audience: "Business Owners and Professionals",
          sourceCaption: creative.caption,
        }),
      });
      const data: any = await response.json();
      if (!response.ok) throw new Error(data.details || data.error || "Storyboard generation failed");
      const next = data as Storyboard;
      next.scenes = next.scenes.map((scene, index) => index === 0 ? { ...scene, imageUrl: creative.imageUrl } : scene);
      setStoryboard(next);
      setStatus("Storyboard ready. Scene 1 is locked to the current post image.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function generateRemainingVisuals() {
    if (!storyboard || !creative?.imageUrl) return;
    setBusy("assets");
    setError("");
    setVideoUrl("");
    setSavedVideoUrl("");
    setScheduled(false);
    try {
      const scenes: Scene[] = storyboard.scenes.map((scene, index) => index === 0 ? { ...scene, imageUrl: creative.imageUrl } : scene);
      for (let index = 1; index < scenes.length; index += 1) {
        const scene = scenes[index];
        setStatus(`Generating Reel visual ${index + 1}/5…`);
        const response = await fetch("/api/autoposter/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageName,
            topic: `${storyboard.title} · scene ${scene.scene}`,
            contentType: "Educational Reel Scene",
            tone: "Professional Hinglish",
            language,
            audience: "Business Owners and Professionals",
            visualStyle: "Premium Editorial Cinematic",
            aspectRatio: "Portrait 9:16",
            branding: "No branding",
            logoPosition: "Bottom Right",
            cta: "None",
            customPrompt: `${scene.visualPrompt} Clean artwork only. No text, logos, letters, numbers, subtitles or watermarks. Designed for a vertical 9:16 educational Reel.`,
            imgPrompt: scene.visualPrompt,
          }),
        });
        const data: any = await response.json();
        if (!response.ok || !data.imageUrl) throw new Error(data.details || data.error || `Scene ${index + 1} visual generation failed`);
        scenes[index] = { ...scene, imageUrl: data.imageUrl };
        setStoryboard((current) => current ? { ...current, scenes: current.scenes.map((item) => item.scene === scene.scene ? { ...item, imageUrl: data.imageUrl } : item) } : current);
      }
      setStoryboard((current) => current ? { ...current, scenes } : current);
      setStatus("All five Reel visuals are ready. Click Create Reel Video when you are ready to render.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function renderReel() {
    if (!readyForRender || !storyboard) return;
    setBusy("render");
    setError("");
    setVideoUrl("");
    setSavedVideoUrl("");
    setScheduled(false);
    setStatus("Generating voice and rendering the Reel in your browser…");
    try {
      const narration = storyboard.scenes.map((scene) => scene.narration).join(" ");
      const audioResponse = await fetch("/api/reel-lab/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: narration, speaker: "luna" }),
      });
      if (!audioResponse.ok) {
        const data: any = await audioResponse.json().catch(() => ({}));
        throw new Error(data.details || data.error || "Voice generation failed");
      }
      const audioUrl = URL.createObjectURL(await audioResponse.blob());
      const audio = new Audio(audioUrl);
      audio.preload = "auto";
      await new Promise<void>((resolve, reject) => {
        audio.onloadedmetadata = () => resolve();
        audio.onerror = () => reject(new Error("Generated voice could not be decoded."));
      });

      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas is unavailable.");
      const width = 540;
      const height = 960;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas rendering context is unavailable.");

      const [images, logo] = await Promise.all([
        Promise.all(storyboard.scenes.map((scene) => loadImage(scene.imageUrl as string))),
        loadImage(LOGOS[pageName]),
      ]);
      const canvasStream = canvas.captureStream(30);
      const capture = (audio as HTMLAudioElement & { captureStream?: () => MediaStream }).captureStream;
      let audioStream: MediaStream;
      if (capture) {
        audioStream = capture.call(audio);
      } else {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(audio);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        source.connect(audioContext.destination);
        audioStream = destination.stream;
      }
      const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioStream.getAudioTracks()]);
      const mimeCandidates = [
        "video/mp4;codecs=avc1.424028,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      if (!mimeType) throw new Error("This browser cannot record a supported Reel format. Try current Chrome or Safari.");
      const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const done = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error("Browser video recording failed."));
      });
      recorder.start(250);
      await audio.play();
      const starts: number[] = [];
      let cursor = 0;
      storyboard.scenes.forEach((scene) => { starts.push(cursor); cursor += scene.durationSeconds; });
      const duration = Math.max(cursor, Number.isFinite(audio.duration) ? audio.duration + 0.2 : cursor);
      const started = performance.now();
      const draw = () => {
        const elapsed = (performance.now() - started) / 1000;
        let index = storyboard.scenes.findIndex((scene, i) => elapsed >= starts[i] && elapsed < starts[i] + scene.durationSeconds);
        if (index < 0) index = storyboard.scenes.length - 1;
        const scene = storyboard.scenes[index];
        const progress = Math.max(0, Math.min(1, (elapsed - starts[index]) / scene.durationSeconds));
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, width, height);
        drawCover(ctx, images[index], width, height, progress);
        const gradient = ctx.createLinearGradient(0, height * .48, 0, height);
        gradient.addColorStop(0, "rgba(0,0,0,0)");
        gradient.addColorStop(.48, "rgba(0,0,0,.18)");
        gradient.addColorStop(1, "rgba(0,0,0,.88)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        drawBrandMark(ctx, logo, width);
        ctx.fillStyle = "rgba(255,255,255,.82)";
        ctx.font = "700 13px system-ui, sans-serif";
        ctx.fillText(`${index + 1}/5`, 24, 42);
        ctx.font = "700 27px system-ui, sans-serif";
        const lines = wrapText(ctx, scene.caption, width - 48);
        const lineHeight = 35;
        const boxH = lines.length * lineHeight + 30;
        const boxY = height - boxH - 36;
        ctx.fillStyle = "rgba(0,0,0,.34)";
        ctx.beginPath();
        ctx.roundRect(18, boxY - 12, width - 36, boxH, 18);
        ctx.fill();
        ctx.fillStyle = "#fff";
        lines.forEach((line, lineIndex) => ctx.fillText(line, 32, boxY + 20 + lineIndex * lineHeight));
        if (elapsed < duration) requestAnimationFrame(draw);
        else {
          audio.pause();
          recorder.stop();
          combined.getTracks().forEach((track) => track.stop());
        }
      };
      requestAnimationFrame(draw);
      await done;
      const output = new Blob(chunks, { type: mimeType });
      const objectUrl = URL.createObjectURL(output);
      setVideoUrl(objectUrl);
      setVideoMime(mimeType);
      setStatus("Reel video created. Saving the production MP4 to R2…");
      await autoSave(output, mimeType);
      URL.revokeObjectURL(audioUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function autoSave(blob: Blob, mimeType: string) {
    if (!mimeType.startsWith("video/mp4")) throw new Error("Production Reel requires MP4. This browser returned WebM, so it was not stored as a production asset.");
    setBusy("save");
    const form = new FormData();
    form.set("pageName", pageName);
    form.set("file", new File([blob], `${pageName.toLowerCase()}-reel.mp4`, { type: "video/mp4" }));
    const response = await fetch("/api/reel-lab/assets", { method: "POST", body: form });
    const data: any = await response.json();
    if (!response.ok || !data.videoUrl) throw new Error(data.details || data.error || "Could not save Reel to R2.");
    setSavedVideoUrl(data.videoUrl);
    setStatus("Production MP4 saved to R2. Ready to preview, download, publish or schedule.");
    const historyResponse = await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageName, pageId: PAGE_IDS[pageName], contentType: "reel", caption, videoUrl: data.videoUrl, status: "draft" }),
    });
    if (!historyResponse.ok) {
      const historyData: any = await historyResponse.json().catch(() => ({}));
      throw new Error(historyData.details || historyData.error || "Reel was saved to R2, but draft history could not be recorded.");
    }
  }

  async function publish() {
    if (!savedVideoUrl || !storyboard) return;
    if (!window.confirm(`Publish this Reel now to the ${pageName} Facebook Page?`)) return;
    setBusy("publish");
    setError("");
    try {
      const response = await fetch("/api/autoposter/reels/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageName, videoUrl: savedVideoUrl, title: storyboard.title, caption }),
      });
      const data: any = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.details || data.error || "Facebook Reel publishing failed.");
      setStatus(`Facebook Reel published successfully · video ${data.videoId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function schedule() {
    if (!savedVideoUrl || !storyboard || !scheduleAt) {
      setError("Choose a future date and time before scheduling the Reel.");
      return;
    }
    const timestamp = new Date(scheduleAt);
    if (!Number.isFinite(timestamp.getTime()) || timestamp.getTime() <= Date.now() + 30_000) {
      setError("Schedule time must be at least 30 seconds in the future.");
      return;
    }
    setBusy("schedule");
    setError("");
    try {
      const response = await fetch("/api/autoposter/schedules/reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageName, videoUrl: savedVideoUrl, title: storyboard.title, caption, scheduledAt: timestamp.toISOString() }),
      });
      const data: any = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.details || data.error || "Facebook Reel scheduling failed.");
      setScheduled(true);
      setStatus(`Reel scheduled for ${timestamp.toLocaleString()} · ${pageName}. Cloudflare scheduler will publish it when due.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const stepButton = (enabled: boolean, primary = false) => ({
    minHeight: 48,
    padding: "0 18px",
    borderRadius: 12,
    border: primary ? "1px solid rgba(56,189,248,.45)" : "1px solid rgba(148,163,184,.28)",
    background: primary ? "linear-gradient(135deg, rgba(14,116,144,.95), rgba(37,99,235,.95))" : "rgba(15,23,42,.72)",
    color: "#fff",
    fontWeight: 750,
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : .48,
    width: "100%",
  } as const);

  return (
    <section className="reel-composer" style={{ display: "grid", gap: 16 }}>
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div className="reel-composer-header" style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><FilmStrip size={22} /><strong style={{ fontSize: 20 }}>Reel Studio</strong></div>
          <p style={{ margin: "6px 0 0", opacity: .72 }}>Create → generate visuals → render MP4 → preview → download → publish or schedule.</p>
        </div>
        <span style={{ padding: "6px 10px", borderRadius: 999, background: "rgba(34,197,94,.12)", color: "#16a34a", fontWeight: 700, fontSize: 12 }}>MANUAL CONTROL</span>
      </div>

      {status && <div className="status success" style={{ display: "flex", gap: 8, alignItems: "center" }}><CheckCircle size={18} /><span>{status}</span></div>}
      {error && <div className="status error" style={{ display: "flex", gap: 8, alignItems: "center" }}><WarningCircle size={18} /><span>{error}</span></div>}

      {creative?.imageUrl ? (
        <div className="reel-composer-source" style={{ display: "flex", gap: 14, alignItems: "center", padding: 12, borderRadius: 14, border: "1px solid rgba(148,163,184,.2)" }}>
          <img src={creative.imageUrl} alt="Current post visual" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10 }} />
          <div><strong>{creative.pageName}</strong><p style={{ margin: "3px 0" }}>{creative.topic || "Current generated post"}</p><small style={{ opacity: .65 }}>This existing post image is reused as Scene 1. No duplicate generation.</small></div>
        </div>
      ) : (
        <div className="reel-empty"><FilmStrip size={28} /><span>Generate a text + image post first. Then return here to create its Reel.</span></div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
        <button style={stepButton(!!creative?.imageUrl && !busy, true)} onClick={() => void createStoryboard()} disabled={!!busy || !creative?.imageUrl}>
          {busy === "storyboard" ? <SpinnerGap className="spin" size={19} /> : "✨"} Create Reel Storyboard
        </button>
        <button style={stepButton(!!storyboard && !busy, false)} onClick={() => void generateRemainingVisuals()} disabled={!!busy || !storyboard}>
          {busy === "assets" ? <SpinnerGap className="spin" size={19} /> : "🎨"} Generate 4 Remaining Visuals
        </button>
        <button style={stepButton(readyForRender && !busy, false)} onClick={() => void renderReel()} disabled={!!busy || !readyForRender}>
          {busy === "render" || busy === "save" ? <SpinnerGap className="spin" size={19} /> : <Play size={19} />} Create Reel Video
        </button>
      </div>

      {storyboard && (
        <div className="reel-storyboard" style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(148,163,184,.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <div><strong>{storyboard.title}</strong><div style={{ opacity: .7, fontSize: 13, marginTop: 3 }}>{storyboard.hook} · {storyboard.totalSeconds}s · {storyboard.scenes.length} scenes</div></div>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{readyForRender ? "5/5 visuals ready" : `${storyboard.scenes.filter((scene) => !!scene.imageUrl).length}/5 visuals`}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(72px,1fr))", gap: 8, overflowX: "auto" }}>
            {storyboard.scenes.map((scene) => (
              <div key={scene.scene} style={{ minWidth: 72 }}>
                {scene.imageUrl ? <img src={scene.imageUrl} alt={`Scene ${scene.scene}`} style={{ width: "100%", aspectRatio: "9/16", objectFit: "cover", borderRadius: 9 }} /> : <div style={{ aspectRatio: "9/16", borderRadius: 9, display: "grid", placeItems: "center", background: "rgba(148,163,184,.12)", fontSize: 11 }}>Pending</div>}
                <small style={{ display: "block", marginTop: 4, opacity: .7 }}>Scene {scene.scene}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {videoUrl && (
        <div className="reel-preview" style={{ padding: 14, borderRadius: 16, border: "1px solid rgba(56,189,248,.3)", background: "rgba(15,23,42,.18)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
            <div><strong>▶ Reel Video Preview</strong><div style={{ fontSize: 12, opacity: .65, marginTop: 3 }}>{videoMime || "video/mp4"}</div></div>
            {savedVideoUrl && <span style={{ color: "#16a34a", fontWeight: 700, fontSize: 12 }}>R2 SAVED</span>}
          </div>
          <video src={videoUrl} controls playsInline preload="metadata" style={{ display: "block", width: "min(100%, 420px)", maxHeight: 680, margin: "0 auto", borderRadius: 12, background: "#000" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 12 }}>
            <a href={videoUrl} download={`${pageName.toLowerCase()}-reel.mp4`} className="secondary-button" style={{ textAlign: "center", textDecoration: "none", padding: "13px 16px" }}>⬇ Download MP4</a>
            {savedVideoUrl && <a href={savedVideoUrl} target="_blank" rel="noreferrer" className="secondary-button" style={{ textAlign: "center", textDecoration: "none", padding: "13px 16px" }}>Open saved R2 asset</a>}
          </div>
        </div>
      )}

      {savedVideoUrl && !scheduled && (
        <div style={{ display: "grid", gap: 12, padding: 14, borderRadius: 16, border: "1px solid rgba(148,163,184,.2)" }}>
          <div><strong>Publish / Schedule Reel</strong><p style={{ margin: "4px 0 0", opacity: .68, fontSize: 13 }}>The production MP4 is already stored in R2, so scheduling does not depend on this browser staying open.</p></div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 10, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 12, fontWeight: 700 }}>Schedule date & time</span><input type="datetime-local" min={minSchedule} value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} /></label>
            <button className="secondary-button" onClick={() => void schedule()} disabled={!!busy} style={{ minHeight: 44 }}>{busy === "schedule" ? <SpinnerGap className="spin" size={18} /> : <CalendarCheck size={18} />} Schedule Reel</button>
          </div>
          <button className="primary-button" onClick={() => void publish()} disabled={!!busy} style={{ minHeight: 46 }}>{busy === "publish" ? <SpinnerGap className="spin" size={18} /> : "🚀"} Publish to Facebook Now</button>
        </div>
      )}

      {scheduled && <div className="status success" style={{ display: "flex", gap: 8, alignItems: "center" }}><CalendarCheck size={18} /><span>Queued successfully. Check the Schedule page for status, cancellation and publishing history.</span></div>}
    </section>
  );
}
