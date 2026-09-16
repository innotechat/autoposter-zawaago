import "../reel-studio.css";
import { useEffect, useMemo } from "react";
import Autoposter, { type FetchLike } from "./autoposter";
import ReelComposer from "../components/reel-composer-v2";

type BrandName = "Zawaago" | "InnoTech";
const LOGOS: Record<BrandName, string> = { Zawaago: "/brand/zawaago-logo-final.svg", InnoTech: "/brand/innotech-logo-final.svg" };

function loadImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image for branding."));
    };
    image.src = url;
  });
}

async function applyBranding(imageUrl: string, pageName: BrandName, branding: string, logoPosition: string, fetcher: FetchLike) {
  if (branding === "No branding") return imageUrl;
  const [ir, lr] = await Promise.all([fetcher(imageUrl, { cache: "no-store" }), fetcher(LOGOS[pageName], { cache: "force-cache" })]);
  if (!ir.ok || !lr.ok) throw new Error("Branding assets could not be loaded.");
  const [ib, lb] = await Promise.all([ir.blob(), lr.blob()]);
  const [image, logo] = await Promise.all([loadImage(ib), loadImage(lb)]);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser canvas is unavailable for logo composition.");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const min = Math.min(canvas.width, canvas.height);
  const target = min * (branding === "Branded creative" ? 0.20 : 0.14);
  const scale = target / Math.max(logo.naturalWidth || logo.width, logo.naturalHeight || logo.height);
  const lw = (logo.naturalWidth || logo.width) * scale;
  const lh = (logo.naturalHeight || logo.height) * scale;
  const margin = Math.max(24, Math.round(min * 0.04));
  let x = margin;
  let y = margin;
  if (logoPosition === "Top Right") x = canvas.width - lw - margin;
  if (logoPosition === "Bottom Left") y = canvas.height - lh- margin;
  if (logoPosition === "Bottom Right") {
    x = canvas.width - lw - margin;
    y = canvas.height - lh - margin;
  }
  ctx.save();
  ctx.globalAlpha = branding === "Branded creative" ? 0.98 : 0.92;
  ctx.shadowColor = "rgba(0,0,0,.22)";
  ctx.shadowBlur = Math.max(6, Math.round(min * 0.008));
  ctx.shadowOffsetY = Math.max(2, Math.round(min * 0.003));
  ctx.drawImage(logo, x, y, lw, lh);
  ctx.restore();
  const output = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
  if (!output) throw new Error("Could not encode the branded image.");
  const form = new FormData();
  form.append("pageName", pageName);
  form.append("file", output, `${pageName.toLowerCase()}-branded.jpg`);
  const upload = await fetcher("/api/autoposter/assets/brand", { method: "POST", body: form });
  const data: any = await upload.json().catch(() => ({}));
  if (!upload.ok || !data.imageUrl) throw new Error(data.details || data.error || "Could not store the branded image.");
  return data.imageUrl as string;
}

export default function BrandedAutoposter() {
  const wrappedFetcher: FetchLike = useMemo(() => {
    return async (input: RequestInfo | URL, init?: RequestInit) => {
      const baseFetch = (typeof window !== "undefined" ? window.fetch.bind(window) : fetch) as FetchLike;
      const response = await baseFetch(input, init);
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (!url.endsWith("/api/autoposter/generate-image") || !response.ok) return response;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      const pageName: BrandName = body?.pageName === "InnoTech" ? "InnoTech" : "Zawaago";
      const branding = String(body?.branding || "Subtle watermark");
      const logoPosition = String(body?.logoPosition || "Bottom Right");

      if (branding === "No branding") {
        try {
          const data: any = await response.clone().json();
          const existing: any = JSON.parse(localStorage.getItem("autoposter:latest-creative") || "{}");
          localStorage.setItem(
            "autoposter:latest-creative",
            JSON.stringify({
              ...existing,
              pageName,
              topic: body?.topic || existing.topic || "",
              imageUrl: data?.imageUrl || "",
              imagePrompt: data?.prompt || existing.imagePrompt || body?.imgPrompt || "",
            })
          );
        } catch {}
        return response;
      }

      try {
        const data: any = await response.clone().json();
        if (!data?.imageUrl) throw new Error("Generated visual did not return an image URL.");
        const branded = await applyBranding(data.imageUrl, pageName, branding, logoPosition, baseFetch);
        localStorage.setItem(
          "autoposter:latest-creative",
          JSON.stringify({
            ...JSON.parse(localStorage.getItem("autoposter:latest-creative") || "{}"),
            pageName,
            topic: body?.topic || "",
            imageUrl: branded,
            imagePrompt: data.prompt || body?.imgPrompt || "",
          })
        );
        return new Response(
          JSON.stringify({
            ...data,
            imageUrl: branded,
            source: `${data.source || "generated"}+real-logo-overlay`,
            brandingApplied: true,
          }),
          { status: response.status, headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: "Branding failed", details: error instanceof Error ? error.message : String(error) }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const descriptor = Object.getOwnPropertyDescriptor(window, "fetch");
    let overridden = false;

    try {
      Object.defineProperty(window, "fetch", {
        value: wrappedFetcher,
        writable: true,
        configurable: true,
      });
      overridden = true;
    } catch {
      try {
        (window as any).fetch = wrappedFetcher;
        overridden = true;
      } catch {
        // Safe fallback: window.fetch has only a getter or is read-only in this window/iframe.
        // Autoposter receives wrappedFetcher directly via the fetcher prop.
      }
    }

    return () => {
      if (!overridden) return;
      try {
        if (descriptor) {
          Object.defineProperty(window, "fetch", descriptor);
        } else {
          delete (window as any).fetch;
        }
      } catch {
        // Safe cleanup ignore
      }
    };
  }, [wrappedFetcher]);

  return (
    <Autoposter fetcher={wrappedFetcher}>
      <ReelComposer />
    </Autoposter>
  );
}
