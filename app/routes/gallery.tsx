import { useEffect, useState } from "react";

interface Asset {
  key: string;
  brand: "Zawaago" | "InnoTech";
  createdAt: string;
  mimeType: string;
  size: number;
  url: string;
  source: string;
}

export default function Gallery() {
  const [brand, setBrand] = useState<"All" | "Zawaago" | "InnoTech">("All");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState("");

  async function loadAssets(selected = brand) {
    setLoading(true); setError("");
    try {
      const query = selected === "All" ? "" : `?brand=${encodeURIComponent(selected)}`;
      const response = await fetch(`/api/gallery/assets${query}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to load gallery.");
      setAssets(data.assets || []);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load gallery."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadAssets(); }, []);

  function useAsset(asset: Asset) {
    localStorage.setItem("autoposter:selected-asset", JSON.stringify(asset));
    window.location.href = `/?asset=${encodeURIComponent(asset.url)}`;
  }

  async function deleteAsset(asset: Asset) {
    if (!window.confirm("Delete this generated image permanently?")) return;
    setDeleting(asset.key); setError("");
    try {
      const response = await fetch(`/api/gallery/assets/${encodeURIComponent(asset.key)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to delete asset.");
      setAssets((current) => current.filter((item) => item.key !== asset.key));
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to delete asset."); }
    finally { setDeleting(""); }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5f3ef", padding: "40px 20px" }}>
      <section style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "end", marginBottom: 28, flexWrap: "wrap" }}>
          <div><p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", opacity: .55 }}>ZAWAAGO AUTOPSTER</p><h1 style={{ margin: "8px 0 6px", fontSize: "clamp(32px,5vw,56px)", letterSpacing: "-.04em" }}>Image Gallery</h1><p style={{ margin: 0, opacity: .62 }}>Your persistent AI-generated creative library.</p></div>
          <a href="/" style={{ textDecoration: "none", border: "1px solid #d8d3cb", borderRadius: 999, padding: "11px 17px", color: "inherit", fontWeight: 700 }}>← Content Studio</a>
        </header>
        <nav style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          {(["All", "Zawaago", "InnoTech"] as const).map((item) => <button key={item} onClick={() => { setBrand(item); void loadAssets(item); }} style={{ border: "1px solid #d8d3cb", borderRadius: 999, padding: "9px 15px", background: brand === item ? "#171717" : "white", color: brand === item ? "white" : "#171717", fontWeight: 700 }}>{item}</button>)}
        </nav>
        {error && <div style={{ marginBottom: 20, padding: 14, borderRadius: 14, background: "#fff0ed", color: "#8d2f21" }}>{error}</div>}
        {loading ? <div style={{ padding: 60, textAlign: "center", opacity: .6 }}>Loading your creative library…</div> : assets.length === 0 ? <div style={{ padding: 70, textAlign: "center", border: "1px dashed #cfc9c0", borderRadius: 24, background: "white" }}><h2>No generated images yet</h2><p style={{ opacity: .6 }}>Create your first visual in Content Studio and it will appear here.</p></div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 18 }}>{assets.map((asset) => <article key={asset.key} style={{ background: "white", border: "1px solid #e5e0d8", borderRadius: 20, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,.05)" }}><img src={asset.url} alt={`${asset.brand} generated creative`} loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "1", objectFit: "cover" }} /><div style={{ padding: 14 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, fontWeight: 800 }}><span>{asset.brand}</span><span style={{ opacity: .45 }}>{new Date(asset.createdAt).toLocaleDateString()}</span></div><div style={{ display: "flex", gap: 8, marginTop: 12 }}><button onClick={() => useAsset(asset)} style={{ flex: 1, border: 0, borderRadius: 10, padding: 10, background: "#171717", color: "white", fontWeight: 800 }}>Use image</button><button onClick={() => void deleteAsset(asset)} disabled={deleting === asset.key} aria-label="Delete image" style={{ border: "1px solid #ddd7cf", borderRadius: 10, padding: "10px 12px", background: "white" }}>{deleting === asset.key ? "…" : "Delete"}</button></div></div></article>)}</div>}
      </section>
    </main>
  );
}
