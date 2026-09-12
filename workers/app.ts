import { Hono } from "hono";
import { createRequestHandler } from "react-router";
import { apiRoutes } from "./api";
import { galleryRoutes } from "./gallery";
import { historyRoutes } from "./history";
import { brandingRoutes } from "./branding";
import { imageRoutes } from "./image";

type Env = {
  AI: Ai;
  FB_TOKEN_ZAWAAGO?: string;
  FB_TOKEN_INNOTECH?: string;
  PAGE_ID_ZAWAAGO: string;
  PAGE_ID_INNOTECH: string;
  ASSETS?: R2Bucket;
};

const app = new Hono<{ Bindings: Env }>();

// Register the production image pipeline before the legacy API route so the
// public /generate-image endpoint always uses Cloudflare Flux + R2 and never
// returns a third-party generator URL with a watermark.
app.route("/api", imageRoutes);
app.route("/api", apiRoutes);
app.route("/api", galleryRoutes);
app.route("/api", historyRoutes);
app.route("/api", brandingRoutes);

app.get("*", (c) => {
  const requestHandler = createRequestHandler(
    () => import("virtual:react-router/server-build"),
    import.meta.env.MODE,
  );
  return requestHandler(c.req.raw, {
    cloudflare: { env: c.env as any, ctx: c.executionCtx as any },
  });
});

export default { fetch: app.fetch };
