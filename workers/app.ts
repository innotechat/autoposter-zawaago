import { Hono } from "hono";
import { createRequestHandler } from "react-router";
import { apiRoutes } from "./api";
import { galleryRoutes } from "./gallery";
import { historyRoutes } from "./history";
import { brandingRoutes } from "./branding";
import { seriesRoutes } from "./series";
import { reelLabRoutes } from "./reel-lab";
import { schedulerRoutes, processDueSchedules } from "./scheduler";
import { seriesSchedulerRoutes } from "./series-scheduler";
import { facebookHealthRoutes } from "./facebook-health";
import { reelRoutes } from "./reels";
import { contentEngineRoutes } from "./content-engine/routes";
import { publicAssetGuard, reelRequestGuard } from "./request-guards";
import { ensureContentEngineTables } from "./content-engine/db";
import { ensureTenDayPlan, isAutomationEnabledDurable } from "./content-engine/autonomous-planner";
import { executeDailyQueue } from "./content-engine/daily-executor";

type Env = { REEL_RENDERER: DurableObjectNamespace<any>; AI: Ai; FB_TOKEN_ZAWAAGO?: string; FB_TOKEN_INNOTECH?: string; PAGE_ID_ZAWAAGO: string; PAGE_ID_INNOTECH: string; ASSETS?: R2Bucket; DB?: D1Database };
const app = new Hono<{ Bindings: Env }>();
app.use("/api/autoposter/assets/*", publicAssetGuard);
app.use("/api/reel-lab/*", reelRequestGuard);
app.use("/api/autoposter/generate-image", reelRequestGuard);
app.route("/api", apiRoutes);
app.route("/api", galleryRoutes);
app.route("/api", historyRoutes);
app.route("/api", brandingRoutes);
app.route("/api", seriesRoutes);
app.route("/api", reelLabRoutes);
app.route("/api", schedulerRoutes);
app.route("/api", seriesSchedulerRoutes);
app.route("/api", facebookHealthRoutes);
app.route("/api", reelRoutes);
app.route("/api", contentEngineRoutes);
app.get("*", (c) => { const requestHandler = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE); return requestHandler(c.req.raw, { cloudflare: { env: c.env as any, ctx: c.executionCtx as any } }); });

// Reel production checkpoint: keep this entrypoint deployable from main after every verified Reel fix.
export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    await ensureContentEngineTables(env.DB);
    if (await isAutomationEnabledDurable(env.DB)) {
      const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      await ensureTenDayPlan({ startDate: todayIST, db: env.DB, assets: env.ASSETS });
      await executeDailyQueue(todayIST, env, { publishNow: false, requestOrigin: "https://autoposter-zawaago.innotechat.workers.dev" });
    }
    await processDueSchedules(env);
  }
};
