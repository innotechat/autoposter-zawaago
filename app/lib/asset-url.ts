export function resolveAssetUrl(rawUrl?: string, options?: { absolute?: boolean }): string {
  if (!rawUrl) return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) return trimmed;

  let pathAndQuery = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (
        parsed.pathname.startsWith("/api/autoposter/assets/") ||
        parsed.pathname.startsWith("/api/gallery/asset/")
      ) {
        pathAndQuery = `${parsed.pathname}${parsed.search}`;
      } else {
        return trimmed;
      }
    } catch {
      return trimmed;
    }
  }

  if (options?.absolute && typeof window !== "undefined" && pathAndQuery.startsWith("/")) {
    return `${window.location.origin}${pathAndQuery}`;
  }
  return pathAndQuery;
}
