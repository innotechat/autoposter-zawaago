import { Container, getContainer } from "@cloudflare/containers";

export interface ReelRenderScene {
  imageUrl: string;
  durationSeconds: number;
  caption: string;
}

export interface ReelRenderManifest {
  planId: string;
  scenes: ReelRenderScene[];
  audioUrl: string;
  width?: number;
  height?: number;
  fps?: number;
}

export class ReelRenderer extends Container {
  defaultPort = 8080;
  sleepAfter = "5m";
  enableInternet = true;
  override onError(error: unknown) {
    console.error("ReelRenderer container error:", error);
  }
}

export async function renderReelInContainer(
  env: { REEL_RENDERER: DurableObjectNamespace<ReelRenderer> },
  manifest: ReelRenderManifest
): Promise<Uint8Array> {
  const stub = getContainer(env.REEL_RENDERER, "autoposter-reel-renderer");
  const response = await stub.fetch("https://reel-renderer/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(manifest),
  });
  if (!response.ok) {
    throw new Error(`Reel renderer returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("video/mp4")) {
    throw new Error(`Reel renderer returned unexpected content type: ${contentType}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 1000) throw new Error("Reel renderer returned an unexpectedly small MP4.");
  return bytes;
}
