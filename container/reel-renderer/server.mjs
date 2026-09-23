import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 8080);

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d; });
    child.stderr.on("data", d => { stderr += d; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-3000)}`)));
  });
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Asset fetch failed ${res.status}: ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 100) throw new Error(`Asset is unexpectedly small: ${url}`);
  await fs.writeFile(file, bytes);
}

function esc(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%");
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "reel-renderer" }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/render") {
    res.writeHead(404); res.end("Not found"); return;
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const manifest = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(manifest.scenes) || manifest.scenes.length !== 5 || !manifest.audioUrl) {
      throw new Error("Invalid render manifest: five scenes and audioUrl are required.");
    }

    const work = await fs.mkdtemp(path.join(os.tmpdir(), "reel-"));
    const sceneFiles = [];
    try {
      for (let i = 0; i < manifest.scenes.length; i++) {
        const file = path.join(work, `scene-${i}.jpg`);
        await download(manifest.scenes[i].imageUrl, file);
        sceneFiles.push(file);
      }
      const audioFile = path.join(work, "voice.wav");
      await download(manifest.audioUrl, audioFile);
      const output = path.join(work, "output.mp4");

      const width = Number(manifest.width || 540);
      const height = Number(manifest.height || 960);
      const fps = Number(manifest.fps || 30);
      const filters = [];
      for (let i = 0; i < manifest.scenes.length; i++) {
        const scene = manifest.scenes[i];
        const duration = Math.max(1, Number(scene.durationSeconds || 5));
        const caption = esc(scene.caption || "");
        filters.push(
          `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,zoompan=z='min(zoom+0.0006,1.08)':d=${Math.max(1, Math.round(duration * fps))}:s=${width}x${height}:fps=${fps},drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${caption}':fontcolor=white:fontsize=27:line_spacing=8:x=(w-text_w)/2:y=h-150:box=1:boxcolor=black@0.45:boxborderw=18[v${i}]`
        );
      }
      const concatInputs = manifest.scenes.map((_, i) => `[v${i}]`).join("");
      filters.push(`${concatInputs}concat=n=${manifest.scenes.length}:v=1:a=0[v]`);

      const args = ["-y"];
      for (const file of sceneFiles) args.push("-loop", "1", "-i", file);
      args.push("-i", audioFile, "-filter_complex", filters.join(";"), "-map", "[v]", "-map", `${manifest.scenes.length}:a`, "-t", String(manifest.scenes.reduce((s, x) => s + Number(x.durationSeconds || 0), 0) + 1), "-r", String(fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output];

      await run("ffmpeg", args);
      const bytes = await fs.readFile(output);
      if (bytes.length < 1000) throw new Error("Rendered MP4 is unexpectedly small.");

      res.writeHead(200, { "content-type": "video/mp4", "content-length": bytes.length.toString(), "cache-control": "no-store" });
      res.end(bytes);
    } finally {
      await fs.rm(work, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`reel-renderer listening on :${PORT}`));
