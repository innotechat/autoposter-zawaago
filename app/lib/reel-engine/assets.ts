import type { ReelAsset, ReelBrand } from "./types";

export type GalleryAsset = ReelAsset & {
  brand: ReelBrand;
  createdAt: string;
  mimeType: string;
  size: number;
  etag: string;
  source: "generated" | "upload";
};

export type GalleryResponse = {
  ok: boolean;
  assets: GalleryAsset[];
  cursor: string | null;
};

export async function fetchGalleryAssets(options: {
  brand?: ReelBrand;
  limit?: number;
  cursor?: string;
} = {}): Promise<GalleryResponse> {
  const params = new URLSearchParams();
  if (options.brand) params.set("brand", options.brand);
  if (options.limit) params.set("limit", String(options.limit));
  if (options.cursor) params.set("cursor", options.cursor);

  const response = await fetch(`/api/gallery/assets${params.toString() ? `?${params}` : ""}`, {
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as Partial<GalleryResponse> & { error?: string };
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Gallery assets could not be loaded.");
  }
  return {
    ok: true,
    assets: data.assets || [],
    cursor: data.cursor || null,
  };
}

export function assetCanBeUsedAsVisual(asset: ReelAsset): boolean {
  return asset.mimeType?.startsWith("image/") === true;
}
