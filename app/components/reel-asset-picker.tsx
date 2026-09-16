import "./reel-asset-picker.css";
import { useEffect, useState } from "react";
import { Check, Images, SpinnerGap, X } from "@phosphor-icons/react";
import { fetchGalleryAssets, type GalleryAsset } from "../lib/reel-engine/assets";
import type { ReelBrand } from "../lib/reel-engine/types";

export type ReelAssetSelection = GalleryAsset[];

export default function ReelAssetPicker({ brand, selected, onChange, onClose }: {
  brand?: ReelBrand;
  selected: ReelAssetSelection;
  onChange: (assets: ReelAssetSelection) => void;
  onClose?: () => void;
}) {
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [activeBrand, setActiveBrand] = useState<ReelBrand | undefined>(brand);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(nextCursor?: string) {
    setLoading(true); setError("");
    try {
      const result = await fetchGalleryAssets({ brand: activeBrand, limit: 24, cursor: nextCursor });
      setAssets((current) => nextCursor ? [...current, ...result.assets] : result.assets); setCursor(result.cursor);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [activeBrand]);
  function toggle(asset: GalleryAsset) { const exists = selected.some((item) => item.key === asset.key); onChange(exists ? selected.filter((item) => item.key !== asset.key) : [...selected, asset]); }

  return <div className="reel-asset-picker" role="dialog" aria-label="Select Reel assets">
    <div className="reel-asset-picker-head"><div><Images size={17} /><strong>Gallery Assets</strong><small>{selected.length} selected</small></div>{onClose && <button type="button" className="reel-asset-close" onClick={onClose} aria-label="Close"><X size={17} /></button>}</div>
    <div className="reel-asset-filters"><button type="button" className={!activeBrand ? "active" : ""} onClick={() => setActiveBrand(undefined)}>All</button><button type="button" className={activeBrand === "Zawaago" ? "active" : ""} onClick={() => setActiveBrand("Zawaago")}>Zawaago</button><button type="button" className={activeBrand === "InnoTech" ? "active" : ""} onClick={() => setActiveBrand("InnoTech")}>InnoTech</button></div>
    {error && <div className="reel-asset-error">{error}</div>}
    {loading && assets.length === 0 && <div className="reel-asset-loading"><SpinnerGap size={20} className="reel-spin" /> Loading Gallery…</div>}
    {!loading && !error && assets.length === 0 && <div className="reel-asset-empty">No generated image assets found for this filter.</div>}
    <div className="reel-asset-grid">{assets.map((asset) => { const checked = selected.some((item) => item.key === asset.key); return <button key={asset.key} type="button" className={`reel-asset-tile${checked ? " selected" : ""}`} onClick={() => toggle(asset)}><img src={asset.url} alt={`${asset.brand} generated asset`} loading="lazy" /><span>{checked ? <Check size={15} weight="bold" /> : asset.brand}</span></button>; })}</div>
    {cursor && <button type="button" className="reel-asset-more" onClick={() => void load(cursor)} disabled={loading}>{loading ? "Loading…" : "Load more"}</button>}
  </div>;
}
