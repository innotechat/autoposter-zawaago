import { useEffect } from "react";
import Autoposter from "./autoposter";

type BrandName = "Zawaago" | "InnoTech";
const LOGOS: Record<BrandName, string> = {
  Zawaago: "/brand/zawaago-logo-final.svg",
  InnoTech: "/brand/innotech-logo-final.svg",
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not decode image for branding.")); };
    image.src = url;
  });
}

async function applyBranding(
  imageUrl: string,
  pageName: BrandName,
  branding: string,
  logoPosition: string,
  originalFetch: FetchLike,
) {
  if (branding === "No branding") return imageUrl;

  const [imageResponse, logoResponse] = await Promise.all([
    originalFetch(imageUrl, { cache: "no-store" }),
    originalFetch(LOGOS[pageName], { cache: "force-cache" }),
  ]);
  if (!imageResponse.ok || !logoResponse.ok) throw new Error("Branding assets could not be loaded.");

  const [imageBlob, logoBlob] = await Promise.all([imageResponse.blob(), logoResponse.blob()]);
  const [image, logo] = await Promise.all([loadImage(imageBlob), loadImage(logoBlob)]);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser canvas is unavailable for logo composition.");

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const minSide = Math.min(canvas.width, canvas.height);
  const target = minSide * (branding === "Branded creative" ? 0.20 : 0.14);
  const logoScale = target / Math.max(logo.naturalWidth || logo.width, logo.naturalHeight || logo.height);
  const logoWidth = (logo.naturalWidth || logo.width) * logoScale;
  const logoHeight = (logo.naturalHeight || logo.height) * logoScale;
  const margin = Math.max(24, Math.round(minSide * 0.04));

  let x = margin;
  let y = margin;
  if (logoPosition === "Top Right") x = canvas.width - logoWidth - margin;
  if (logoPosition === "Bottom Left") y = canvas.height - logoHeight - margin;
  if (logoPosition === "Bottom Right") {
    x = canvas.width - logoWidth - margin;
    y = canvas.height - logoHeight - margin;
  }

  ctx.save();
  ctx.globalAlpha = branding === "Branded creative" ? 0.98 : 0.92;
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = Math.max(6, Math.round(minSide * 0.008));
  ctx.shadowOffsetY = Math.max(2, Math.round(minSide * 0.003));
  ctx.drawImage(logo, x, y, logoWidth, logoHeight);
  ctx.restore();

  const output = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!output) throw new Error("Could not encode the branded image.");

  const form = new FormData();
  form.append("pageName", pageName);
  form.append("file", output, `${pageName.toLowerCase()}-branded.jpg`);
  const upload = await originalFetch("/api/autoposter/assets/brand", { method: "POST", body: form });
  const data: any = await upload.json().catch(() => ({}));
  if (!upload.ok || !data.imageUrl) throw new Error(data.details || data.error || "Could not store the branded image.");
  return data.imageUrl as string;
}

export default function BrandedAutoposter() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window) as FetchLike;
    const wrappedFetch: FetchLike = async (input, init) => {
      const response = await originalFetch(input, init);
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (!url.endsWith("/api/autoposter/generate-image") || !response.ok) return response;

      const requestBody = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      const pageName: BrandName = requestBody?.pageName === "InnoTech" ? "InnoTech" : "Zawaago";
      const branding = String(requestBody?.branding || "Subtle watermark");
      const logoPosition = String(requestBody?.logoPosition || "Bottom Right");
      if (branding === "No branding") return response;

      try {
        const data: any = await response.clone().json();
        if (!data?.imageUrl) throw new Error("Generated visual did not return an image URL.");
        const brandedUrl = await applyBranding(data.imageUrl, pageName, branding, logoPosition, originalFetch);
        const next = { ...data, imageUrl: brandedUrl, source: `${data.source || "generated"}+real-logo-overlay`, brandingApplied: true };
        return new Response(JSON.stringify(next), {
          status: response.status,
          statusText: response.statusText,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: "Branding failed", details: message }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
    };

    window.fetch = wrappedFetch;
    return () => { window.fetch = originalFetch; };
  }, []);

  return <Autoposter />;
}
