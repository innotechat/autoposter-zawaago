import { useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle, FilmStrip, Play, Sparkle, SpinnerGap, SpeakerHigh, WarningCircle } from "@phosphor-icons/react";

type Scene = {
  scene: number;
  durationSeconds: number;
  narration: string;
  caption: string;
  visualPrompt: string;
  imageUrl?: string;
};

type Storyboard = {
  title: string;
  hook: string;
  totalSeconds: number;
  scenes: Scene[];
  pageName: string;
  language: string;
  audience: string;
};

const LOGOS: Record<string, string> = {
  Zawaago: "/brand/zawaago-logo-final.svg",
  InnoTech: "/brand/innotech-logo-final.svg",
};

const TOPIC = "AI Agent vs Chatbot — what is the real difference?";

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

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number, progress: number) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sw = image.naturalWidth;
  let sh = image.naturalHeight;
  if (imageRatio > targetRatio) sw = sh * targetRatio;
  else sh = sw / targetRatio;
  const sx = (image.naturalWidth - sw) / 2;
  const sy = (image.naturalHeight - sh) / 2;
  const zoom = 1.04 + Math.sin(progress * Math.PI) * 0.035;
  const dw = width * zoom;
  const dh = height * zoom;
  ctx.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

async function loadImage(src: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  return image;
}

export default function ReelLab() {
  const [pageName, setPageName] = useState<"Zawaago" | "InnoTech">("Zawaago");
  const [language, setLanguage] = useState("Hinglish");
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [busy, setBusy] = useState<"storyboard" | "assets" | "render" | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const total = useMemo(() => storyboard?.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) || 0, [storyboard]);

  async function createStoryboard() {
    setBusy("storyboard"); setError(""); setVideoUrl(""); setStatus("Designing the five-scene Reel story…");
    try {
      const response = await fetch("/api/reel-lab/storyboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageName, language, topic: TOPIC, audience: "Business Owners and Professionals" }) });
      const data: any = await response.json();
      if (!response.ok) throw new Error(data.details || data.error || "Storyboard generation failed");
      setStoryboard(data as Storyboard);
      setStatus("Storyboard ready. Generate the five scene visuals next.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  async function generateSceneAssets() {
    if (!storyboard) return;
    setBusy("assets"); setError(""); setVideoUrl("");
    try {
      const scenes: Scene[] = [];
      for (let index = 0; index < storyboard.scenes.length; index += 1) {
        const scene = storyboard.scenes[index];
        setStatus(`Generating scene visual ${index + 1}/${storyboard.scenes.length}…`);
        const response = await fetch("/api/autoposter/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageName,
            topic: `${storyboard.title} · scene ${scene.scene}`,
            contentType: "Educational Reel Scene",
            tone: language === "Hinglish" ? "Professional Hinglish" : "Professional English",
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
        if (!response.ok || !data.imageUrl) throw new Error(data.details || data.error || `Scene ${index + 1} image generation failed`);
        scenes.push({ ...scene, imageUrl: data.imageUrl });
        setStoryboard((current) => current ? { ...current, scenes: current.scenes.map((item) => item.scene === scene.scene ? { ...item, imageUrl: data.imageUrl } : item) } : current);
      }
      setStoryboard((current) => current ? { ...current, scenes } : current);
      setStatus("All scene visuals are ready. Generate the narration and render the test Reel.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  async function renderReel() {
    if (!storyboard || storyboard.scenes.some((scene) => !scene.imageUrl)) return;
    setBusy("render"); setError(""); setVideoUrl(""); setStatus("Generating natural voice narration…");
    try {
      const narration = storyboard.scenes.map((scene) => scene.narration).join(" ");
      const audioResponse = await fetch("/api/reel-lab/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: narration, speaker: "luna" }) });
      if (!audioResponse.ok) { const data: any = await audioResponse.json().catch(() => ({})); throw new Error(data.details || data.error || "Voice generation failed"); }
      const audioBlob = await audioResponse.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.preload = "auto";
      await new Promise<void>((resolve, reject) => { audio.onloadedmetadata = () => resolve(); audio.onerror = () => reject(new Error("Generated voice could not be decoded by the browser.")); });

      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas is unavailable.");
      const width = 540; const height = 960; canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas rendering context is unavailable.");
      const [images, logo] = await Promise.all([
        Promise.all(storyboard.scenes.map((scene) => loadImage(scene.imageUrl as string))),
        loadImage(LOGOS[pageName]),
      ]);

      const canvasStream = canvas.captureStream(30);
      let audioStream: MediaStream;
      const capture = (audio as HTMLAudioElement & { captureStream?: () => MediaStream }).captureStream;
      if (capture) audioStream = capture.call(audio);
      else {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(audio);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination); source.connect(audioContext.destination);
        audioStream = destination.stream;
      }
      const combined = new MediaStream([...canvasStream.getVideoTracks(), ...audioStream.getAudioTracks()]);
      const mimeCandidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      if (!mimeType) throw new Error("This browser cannot record a Reel-compatible WebM stream. Try Chrome on Android or desktop Chrome.");
      const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const recordingDone = new Promise<void>((resolve, reject) => { recorder.onstop = () => resolve(); recorder.onerror = () => reject(new Error("Browser video recording failed.")); });
      recorder.start(250);
      await audio.play();

      const sceneStarts: number[] = [];
      let cursor = 0;
      for (const scene of storyboard.scenes) { sceneStarts.push(cursor); cursor += scene.durationSeconds; }
      const duration = Math.max(cursor, Number.isFinite(audio.duration) ? audio.duration + 0.2 : cursor);
      const start = performance.now();
      const logoScale = 0.15;
      const logoW = width * logoScale;
      const logoH = logoW * (logo.naturalHeight / logo.naturalWidth);
      const draw = () => {
        const elapsed = (performance.now() - start) / 1000;
        let sceneIndex = storyboard.scenes.findIndex((scene, index) => elapsed >= sceneStarts[index] && elapsed < sceneStarts[index] + scene.durationSeconds);
        if (sceneIndex < 0) sceneIndex = storyboard.scenes.length - 1;
        const scene = storyboard.scenes[sceneIndex];
        const progress = Math.max(0, Math.min(1, (elapsed - sceneStarts[sceneIndex]) / scene.durationSeconds));
        ctx.fillStyle = "#111"; ctx.fillRect(0, 0, width, height);
        drawCover(ctx, images[sceneIndex], width, height, progress);
        const gradient = ctx.createLinearGradient(0, height * 0.48, 0, height);
        gradient.addColorStop(0, "rgba(0,0,0,0)"); gradient.addColorStop(0.48, "rgba(0,0,0,.18)"); gradient.addColorStop(1, "rgba(0,0,0,.88)");
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
        ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(logo, width - logoW - 24, 24, logoW, logoH); ctx.restore();
        ctx.fillStyle = "rgba(255,255,255,.82)"; ctx.font = "700 13px system-ui, sans-serif"; ctx.fillText(`${sceneIndex + 1}/5`, 24, 42);
        ctx.font = "700 27px system-ui, sans-serif";
        const lines = wrapText(ctx, scene.caption, width - 48);
        const lineHeight = 35; const boxH = lines.length * lineHeight + 30; const boxY = height - boxH - 36;
        ctx.fillStyle = "rgba(0,0,0,.34)"; ctx.roundRect(18, boxY - 12, width - 36, boxH, 18); ctx.fill();
        ctx.fillStyle = "#fff";
        lines.forEach((line, lineIndex) => ctx.fillText(line, 32, boxY + 20 + lineIndex * lineHeight));
        if (elapsed < duration) requestAnimationFrame(draw);
        else { if (audio.paused === false) audio.pause(); recorder.stop(); combined.getTracks().forEach((track) => track.stop()); }
      };
      requestAnimationFrame(draw);
      await recordingDone;
      const output = new Blob(chunks, { type: mimeType });
      setVideoUrl(URL.createObjectURL(output));
      setStatus(`Reel Lab render complete · ${Math.round(duration)}s · ${mimeType.split(";")[0]}. This is a test artifact, not yet the production publisher format.`);
      URL.revokeObjectURL(audioUrl);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  const readyForAssets = !!storyboard;
  const readyForRender = !!storyboard && storyboard.scenes.length === 5 && storyboard.scenes.every((scene) => !!scene.imageUrl);

  return (
    <main className="reel-lab-shell">
      <header className="reel-lab-header">
        <button className="reel-lab-back" onClick={() => { window.location.href = "/"; }}><ArrowLeft size={17} /> Studio</button>
        <div><div className="reel-lab-kicker"><FilmStrip size={14} /> REEL LAB · ISOLATED TEST</div><h1>Build one excellent educational Reel.</h1><p>Test the creative pipeline first. Nothing here publishes to Facebook.</p></div>
        <div className="reel-lab-badge">LAB ONLY</div>
      </header>

      <section className="reel-lab-grid">
        <div className="reel-lab-panel">
          <div className="reel-lab-section"><span>01</span><div><strong>Creative brief</strong><small>Fixed test topic · change language/page only</small></div></div>
          <label>Page<select value={pageName} onChange={(e) => setPageName(e.target.value as "Zawaago" | "InnoTech")}><option>Zawaago</option><option>InnoTech</option></select></label>
          <label>Language<select value={language} onChange={(e) => setLanguage(e.target.value)}><option>Hinglish</option><option>English</option><option>Hindi</option></select></label>
          <div className="reel-topic"><span>Test topic</span><strong>{TOPIC}</strong></div>
          <button className="reel-lab-primary" disabled={!!busy} onClick={createStoryboard}>{busy === "storyboard" ? <SpinnerGap className="spin" /> : <Sparkle />} {storyboard ? "Regenerate storyboard" : "Create storyboard"}</button>
        </div>

        <div className="reel-lab-panel">
          <div className="reel-lab-section"><span>02</span><div><strong>Storyboard</strong><small>{storyboard ? `${storyboard.scenes.length} scenes · ${total.toFixed(0)}s` : "Waiting for the AI story"}</small></div></div>
          {!storyboard ? <div className="reel-empty"><FilmStrip size={30} /><span>Generate the storyboard to see the five-scene structure.</span></div> : <div className="scene-list">{storyboard.scenes.map((scene) => <article className="scene-card" key={scene.scene}><div className="scene-number">{scene.scene}</div><div><strong>{scene.caption}</strong><p>{scene.narration}</p><small>{scene.durationSeconds}s · visual plan ready</small></div></article>)}</div>}
          <button className="reel-lab-secondary" disabled={!readyForAssets || !!busy} onClick={generateSceneAssets}>{busy === "assets" ? <SpinnerGap className="spin" /> : <Sparkle />} Generate 5 scene visuals</button>
        </div>

        <div className="reel-lab-panel reel-render-panel">
          <div className="reel-lab-section"><span>03</span><div><strong>Voice + render</strong><small>Cloudflare Aura-2 + browser video compositor</small></div></div>
          <div className="render-checks"><span className={readyForRender ? "ok" : ""}>{readyForRender ? <CheckCircle /> : <WarningCircle />} Scene visuals</span><span><SpeakerHigh /> Aura-2 narration</span><span><FilmStrip /> 9:16 WebM test</span></div>
          <canvas ref={canvasRef} className="reel-hidden-canvas" />
          <button className="reel-lab-primary" disabled={!readyForRender || !!busy} onClick={renderReel}>{busy === "render" ? <SpinnerGap className="spin" /> : <Play weight="fill" />} Render test Reel</button>
          {videoUrl && <div className="video-result"><video controls playsInline src={videoUrl} /><a href={videoUrl} download="zawaago-reel-lab-test.webm">Save test Reel</a></div>}
        </div>
      </section>

      {(status || error) && <div className={`reel-lab-status ${error ? "error" : ""}`}>{error ? <WarningCircle /> : <CheckCircle />}<span>{error || status}</span></div>}
      <footer className="reel-lab-footer">Testing target: <strong>premium faceless educational Reel</strong> · no auto-publish · no production scheduler changes.</footer>
    </main>
  );
}
