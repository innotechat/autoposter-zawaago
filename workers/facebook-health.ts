import { Hono } from "hono";

type Env = {
  FB_TOKEN_ZAWAAGO?: string;
  FB_TOKEN_INNOTECH?: string;
  PAGE_ID_ZAWAAGO: string;
  PAGE_ID_INNOTECH: string;
};

type PageHealth = {
  pageName: "Zawaago" | "InnoTech";
  pageId: string;
  configured: boolean;
  reachable: boolean;
  validToken: boolean;
  pageNameFromGraph?: string;
  error?: string;
};

const GRAPH_VERSION = "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const facebookHealthRoutes = new Hono<{ Bindings: Env }>();

async function checkPage(pageName: "Zawaago" | "InnoTech", pageId: string | undefined, token: string | undefined): Promise<PageHealth> {
  const id = pageId?.trim() || "";
  const accessToken = token?.trim() || "";
  const base: PageHealth = { pageName, pageId: id, configured: !!id && !!accessToken, reachable: false, validToken: false };
  if (!id || !accessToken) return { ...base, error: "Page ID or Page token is not configured." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${GRAPH_BASE}/${encodeURIComponent(id)}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`, { signal: controller.signal });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) {
      const code = data?.error?.code;
      if (code === 190) return { ...base, reachable: true, error: "Facebook Page token is invalid or expired." };
      if (code === 200) return { ...base, reachable: true, error: "Facebook rejected the Page token or its permissions." };
      return { ...base, reachable: true, error: data?.error?.message || `Facebook returned HTTP ${response.status}.` };
    }
    return { ...base, reachable: true, validToken: true, pageNameFromGraph: String(data?.name || "") || undefined };
  } catch (error) {
    return { ...base, error: error instanceof Error && error.name === "AbortError" ? "Facebook health check timed out." : error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

facebookHealthRoutes.get("/autoposter/facebook-health", async (c) => {
  const [zawaago, innotech] = await Promise.all([
    checkPage("Zawaago", c.env.PAGE_ID_ZAWAAGO, c.env.FB_TOKEN_ZAWAAGO),
    checkPage("InnoTech", c.env.PAGE_ID_INNOTECH, c.env.FB_TOKEN_INNOTECH),
  ]);
  const pages = [zawaago, innotech];
  const healthy = pages.every((page) => page.configured && page.reachable && page.validToken);
  return c.json({ status: healthy ? "ok" : "degraded", graphVersion: GRAPH_VERSION, checkedAt: new Date().toISOString(), pages });
});
