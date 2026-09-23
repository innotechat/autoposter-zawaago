import { Hono } from "hono";
import {
  generateDailyPlan,
  generateTenDayPlan,\n  ensureTenDayPlan,\n  isAutomationEnabledDurable,\n  setAutomationEnabledDurable,
  getPlanById,
  isAutomationEnabled,
  listPlans,
  setAutomationEnabled,
  simulateSchedule,
  syncPlansWithD1,
  updatePlan
} from "./autonomous-planner";
import { getBrandProfile, listRegisteredBrands, registerBrand, updateBrandProfile } from "./brand-brain";
import { getMemoryStats, searchMemory } from "./content-memory";
import { deriveStrategyRecommendations } from "./performance-intelligence";
import { getJob, listJobs, transitionJobState } from "./job-orchestrator";
import { buildCaptionPrompt, buildImagePrompt } from "./prompt-engine";
import { evaluateContentQuality } from "./quality-gate";
import { ensureContentEngineTables, loadJobsFromD1 } from "./db";
import { executeDailyQueue, executePlanItem } from "./daily-executor";
import type { BrandProfile, PostPlan, ReelPlan } from "./types";

type Env = {
  DB?: any;
  ASSETS?: any;
  AI?: any;
  FB_TOKEN_ZAWAAGO?: string;
  FB_TOKEN_INNOTECH?: string;
  PAGE_ID_ZAWAAGO?: string;
  PAGE_ID_INNOTECH?: string;
};

export const contentEngineRoutes = new Hono<{ Bindings: Env }>();

// Middleware to ensure D1 tables exist
contentEngineRoutes.use("*", async (c, next) => {
  if (c.env.DB) {
    await ensureContentEngineTables(c.env.DB);
  }
  await next();
});

/**
 * System status, automation toggle, and memory overview
 */
contentEngineRoutes.get("/content-engine/status", async (c) => {
  if (c.env.DB) {
    await syncPlansWithD1(c.env.DB);
  }
  const brands = listRegisteredBrands();
  const memoryStats = await getMemoryStats(undefined, c.env.DB);
  const jobs = listJobs();
  const plans = listPlans();

  return c.json({
    ok: true,
    automationEnabled: await isAutomationEnabledDurable(c.env.DB),
    brandsCount: brands.length,
    activeBrands: brands.map((b) => ({ name: b.name, handle: b.handle, mission: b.mission })),
    plansCount: plans.length,
    pendingJobsCount: jobs.filter((j) => j.state !== "PUBLISHED" && j.state !== "CANCELLED").length,
    memoryStats,
    schedulePolicy: {
      zawaago: { post: "12:30 IST", reel: "18:30 IST" },
      innotech: { post: "13:00 IST", reel: "19:00 IST" }
    }
  });
});

/**
 * Toggle autonomous scheduling engine
 */
contentEngineRoutes.post("/content-engine/automation/toggle", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { enabled?: boolean };
  const target = typeof body.enabled === "boolean" ? body.enabled : !isAutomationEnabled();
  setAutomationEnabled(target);
  return c.json({ ok: true, automationEnabled: target });
});

/**
 * Multi-day simulation (Dry-Run mode)
 */
contentEngineRoutes.post("/content-engine/simulate", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { daysCount?: number; startDate?: string; brands?: string[] };
  const days = Math.min(30, Math.max(1, Number(body.daysCount || 7)));
  const result = await simulateSchedule(days, body.startDate, body.brands, c.env.DB);
  return c.json({ ok: true, ...result });
});

/**
 * Generate production 10-Day Intelligent Content Calendar for Zawaago & InnoTech
 * Persists plans to D1 architecture and queues state machine jobs.
 */
contentEngineRoutes.post("/content-engine/plan-10-days", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { startDate?: string; brands?: string[] };
  const result = await ensureTenDayPlan({
    startDate: body.startDate,
    brands: body.brands || ["Zawaago", "InnoTech"],
    db: c.env.DB,
    assets: c.env.ASSETS
  });

  return c.json({ ok: true, ...result });
});

/**
 * Generate production daily plan and jobs
 */
contentEngineRoutes.post("/content-engine/plan/generate", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { date?: string; brands?: string[]; includeStories?: boolean };
  const targetDate = body.date || new Date().toISOString().slice(0, 10);
  const plan = await generateDailyPlan(
    {
      date: targetDate,
      brands: body.brands || ["Zawaago", "InnoTech"],
      includeStories: body.includeStories || false,
      dryRun: false
    },
    c.env.DB,
    c.env.ASSETS
  );

  return c.json({ ok: true, plan });
});

/**
 * Autonomous Daily Execution Queue:
 * Executes today's (or given date's) queue: Generate Media → Quality Gate → Ready → Schedule / Publish → History
 */
contentEngineRoutes.post("/content-engine/execute-daily-queue", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { date?: string; publishNow?: boolean };
  const targetDate = body.date || new Date().toISOString().slice(0, 10);
  const origin = new URL(c.req.url).origin;

  const summary = await executeDailyQueue(targetDate, c.env, {
    publishNow: Boolean(body.publishNow),
    requestOrigin: origin
  });

  return c.json({ ok: true, ...summary });
});

/**
 * Execute a single planned item through the pipeline:
 * Post: Caption + Image → Quality Gate → Ready → Schedule / Publish → History
 * Reel: Storyboard + Scenes + Render → Quality Gate → Ready → Schedule / Publish → History
 */
contentEngineRoutes.post("/content-engine/execute-item/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { publishNow?: boolean; forceRegenerate?: boolean };
  const origin = new URL(c.req.url).origin;

  const result = await executePlanItem(id, c.env, {
    publishNow: Boolean(body.publishNow),
    forceRegenerate: Boolean(body.forceRegenerate),
    requestOrigin: origin
  });

  return c.json(result, result.ok ? 200 : 400);
});

/**
 * Retry failed job safely without duplicate Facebook publishing
 */
contentEngineRoutes.post("/content-engine/retry-job/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { publishNow?: boolean };
  const origin = new URL(c.req.url).origin;

  // Resolve planId from jobId if prefixed
  let planId = id;
  if (id.startsWith("job-")) {
    planId = id.slice(4);
  }

  const result = await executePlanItem(planId, c.env, {
    publishNow: Boolean(body.publishNow),
    forceRegenerate: false,
    requestOrigin: origin
  });

  return c.json(result, result.ok ? 200 : 400);
});

/**
 * List plans with D1 persistence sync
 */
contentEngineRoutes.get("/content-engine/plans", async (c) => {
  if (c.env.DB) {
    await syncPlansWithD1(c.env.DB);
  }
  const brand = c.req.query("brand");
  const status = c.req.query("status");
  const plans = listPlans(brand, status);
  return c.json({ ok: true, plans, total: plans.length });
});

/**
 * Get single plan with detailed prompts and creative direction
 */
contentEngineRoutes.get("/content-engine/plans/:id", (c) => {
  const plan = getPlanById(c.req.param("id"));
  if (!plan) return c.json({ ok: false, error: "Plan not found" }, 404);

  let captionPrompt = "";
  let imagePrompt = "";

  if (plan.format === "POST") {
    captionPrompt = buildCaptionPrompt(plan as PostPlan);
    imagePrompt = buildImagePrompt((plan as PostPlan).creativeDirection, plan.brand);
  }

  return c.json({
    ok: true,
    plan,
    derivedPrompts: {
      captionPrompt,
      imagePrompt
    }
  });
});

/**
 * Human Override: Approve plan
 */
contentEngineRoutes.post("/content-engine/plans/:id/approve", async (c) => {
  const id = c.req.param("id");
  const plan = getPlanById(id);
  if (!plan) return c.json({ ok: false, error: "Plan not found" }, 404);

  updatePlan(id, { status: "APPROVED" });
  return c.json({ ok: true, plan: getPlanById(id), message: "Plan manually approved." });
});

/**
 * Human Override: Regenerate targeted component
 */
contentEngineRoutes.post("/content-engine/plans/:id/regenerate", async (c) => {
  const id = c.req.param("id");
  const plan = getPlanById(id);
  if (!plan) return c.json({ ok: false, error: "Plan not found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as {
    target?: "ALL" | "CAPTION_ONLY" | "IMAGE_ONLY" | "SCENE_ONLY";
    sceneNumber?: number;
  };
  const target = body.target || "ALL";

  // Trigger regeneration updates
  if (target === "ALL") {
    updatePlan(id, { status: "PLANNED" });
  } else if (target === "CAPTION_ONLY") {
    updatePlan(id, { generatedCaption: undefined, status: "GENERATING" });
  } else if (target === "IMAGE_ONLY") {
    updatePlan(id, { generatedImageUrl: undefined, status: "GENERATING" });
  }

  return c.json({ ok: true, plan: getPlanById(id), message: `Regeneration initiated for target: ${target}` });
});

/**
 * Human Override: Reschedule
 */
contentEngineRoutes.post("/content-engine/plans/:id/reschedule", async (c) => {
  const id = c.req.param("id");
  const plan = getPlanById(id);
  if (!plan) return c.json({ ok: false, error: "Plan not found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { scheduledFor?: string };
  if (!body.scheduledFor) return c.json({ ok: false, error: "Missing scheduledFor timestamp" }, 400);

  updatePlan(id, { scheduledFor: body.scheduledFor });
  return c.json({ ok: true, plan: getPlanById(id), message: "Plan rescheduled." });
});

/**
 * Human Override: Cancel plan
 */
contentEngineRoutes.post("/content-engine/plans/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const plan = getPlanById(id);
  if (!plan) return c.json({ ok: false, error: "Plan not found" }, 404);

  updatePlan(id, { status: "CANCELLED" });
  return c.json({ ok: true, plan: getPlanById(id), message: "Plan cancelled." });
});

/**
 * Brand Brain: List all registered brand profiles
 */
contentEngineRoutes.get("/content-engine/brands", (c) => {
  const brands = listRegisteredBrands();
  return c.json({ ok: true, brands });
});

/**
 * Brand Brain: Get specific brand profile
 */
contentEngineRoutes.get("/content-engine/brands/:name", (c) => {
  const profile = getBrandProfile(c.req.param("name"));
  return c.json({ ok: true, brand: profile });
});

/**
 * Brand Brain: Register or update brand profile
 */
contentEngineRoutes.post("/content-engine/brands", async (c) => {
  const body = await c.req.json<BrandProfile>().catch(() => null);
  if (!body || !body.name) return c.json({ ok: false, error: "Invalid brand profile" }, 400);

  registerBrand(body);
  return c.json({ ok: true, brand: getBrandProfile(body.name), message: "Brand profile saved." });
});

/**
 * Content Memory Search
 */
contentEngineRoutes.get("/content-engine/memory", async (c) => {
  const brand = c.req.query("brand");
  const query = c.req.query("q");
  const records = await searchMemory(brand, query, c.env.DB);
  return c.json({ ok: true, records, total: records.length });
});

/**
 * Performance Intelligence & Feedback Recommendations
 */
contentEngineRoutes.get("/content-engine/performance", async (c) => {
  const brand = c.req.query("brand") || "Zawaago";
  const recommendations = await deriveStrategyRecommendations(brand, c.env.DB);
  return c.json({ ok: true, brand, recommendations });
});

/**
 * Job Monitor
 */
contentEngineRoutes.get("/content-engine/jobs", async (c) => {
  const brand = c.req.query("brand");
  let jobs = listJobs(brand);
  if (c.env.DB) {
    const d1Jobs = await loadJobsFromD1(c.env.DB, brand);
    const jobMap = new Map();
    for (const j of d1Jobs) jobMap.set(j.id, j);
    for (const j of jobs) jobMap.set(j.id, j);
    jobs = Array.from(jobMap.values());
  }
  return c.json({ ok: true, jobs, total: jobs.length });
});
