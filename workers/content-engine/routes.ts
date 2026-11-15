import { Hono } from "hono";
import {
  generateDailyPlan,
  generateTenDayPlan,
  getPlanById,
  isAutomationEnabledPersisted,
  listPlans,
  setAutomationEnabledPersisted,
  simulateSchedule,
  syncPlansWithD1,
  updatePlan
} from "./autonomous-planner";
import { getBrandProfile, listRegisteredBrands, registerBrand } from "./brand-brain";
import { getMemoryStats, searchMemory } from "./content-memory";
import { deriveStrategyRecommendations } from "./performance-intelligence";
import { listJobs } from "./job-orchestrator";
import { buildCaptionPrompt, buildImagePrompt } from "./prompt-engine";
import { ensureContentEngineTables, getPlanFromD1, loadJobsFromD1, updatePlanInD1 } from "./db";
import { executeDailyQueue, executePlanItem, processContentEngineCron } from "./daily-executor";
import {
  capturePublicOrigin,
  getIstDateString,
  loadEngineSettings,
  saveEngineSettings
} from "./settings";
import { processDueSchedules } from "../scheduler";
import type { BrandProfile, PostPlan } from "./types";

type Env = {
  DB?: any;
  ASSETS?: any;
  AI?: any;
  PUBLIC_ORIGIN?: string;
  FB_TOKEN_ZAWAAGO?: string;
  FB_TOKEN_INNOTECH?: string;
  PAGE_ID_ZAWAAGO?: string;
  PAGE_ID_INNOTECH?: string;
};

export const contentEngineRoutes = new Hono<{ Bindings: Env }>();

// Middleware to ensure D1 tables exist and learn active public origin
contentEngineRoutes.use("*", async (c, next) => {
  if (c.env.DB) {
    await ensureContentEngineTables(c.env.DB);
  }
  await capturePublicOrigin(c.env, c.req.url);
  await next();
});

/**
 * System status, persisted automation settings, Cron telemetry, and memory overview
 */
contentEngineRoutes.get("/content-engine/status", async (c) => {
  if (c.env.DB) {
    await syncPlansWithD1(c.env.DB);
  }
  const settings = await loadEngineSettings(c.env);
  const brands = listRegisteredBrands();
  const memoryStats = await getMemoryStats(undefined, c.env.DB);
  const jobs = c.env.DB ? await loadJobsFromD1(c.env.DB) : listJobs();
  const plans = listPlans();

  return c.json({
    ok: true,
    automationEnabled: settings.automationEnabled,
    settings,
    todayIst: getIstDateString(),
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
 * Toggle autonomous scheduling engine (persisted in D1 & R2)
 */
contentEngineRoutes.post("/content-engine/automation/toggle", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    enabled?: boolean;
    preGenerateMinutes?: number;
    autoPlanRollingDays?: number;
  };
  const current = await isAutomationEnabledPersisted(c.env);
  const target = typeof body.enabled === "boolean" ? body.enabled : !current;
  await setAutomationEnabledPersisted(c.env, target);

  if (body.preGenerateMinutes !== undefined || body.autoPlanRollingDays !== undefined) {
    await saveEngineSettings(c.env, {
      ...(body.preGenerateMinutes !== undefined ? { preGenerateMinutes: Number(body.preGenerateMinutes) } : {}),
      ...(body.autoPlanRollingDays !== undefined ? { autoPlanRollingDays: Number(body.autoPlanRollingDays) } : {})
    });
  }

  const settings = await loadEngineSettings(c.env);
  return c.json({ ok: true, automationEnabled: settings.automationEnabled, settings });
});

/**
 * Manually trigger one Cron automation cycle (rolling IST plan + pre-gen due POSTs + process due R2 schedules)
 */
contentEngineRoutes.post("/content-engine/cron/run-now", async (c) => {
  const origin = new URL(c.req.url).origin;
  const engineRes = await processContentEngineCron(c.env);
  const schedulerRes = await processDueSchedules(c.env, new Date(), origin);
  const settings = await loadEngineSettings(c.env);
  return c.json({
    ok: true,
    engine: engineRes,
    scheduler: schedulerRes,
    settings
  });
});

/**
 * Multi-day simulation (Dry-Run mode)
 */
contentEngineRoutes.post("/content-engine/simulate", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { daysCount?: number; startDate?: string; brands?: string[] };
  const days = Math.min(30, Math.max(1, Number(body.daysCount || 7)));
  const result = await simulateSchedule(days, body.startDate || getIstDateString(), body.brands, c.env.DB);
  return c.json({ ok: true, ...result });
});

/**
 * Generate production 10-Day Intelligent Content Calendar for Zawaago & InnoTech
 * Persists plans to D1 architecture and queues state machine jobs.
 */
contentEngineRoutes.post("/content-engine/plan-10-days", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { startDate?: string; brands?: string[] };
  const result = await generateTenDayPlan({
    startDate: body.startDate || getIstDateString(),
    brands: body.brands || ["Zawaago", "InnoTech"],
    db: c.env.DB,
    assets: c.env.ASSETS,
    ai: c.env.AI
  });

  return c.json({ ok: true, ...result });
});

/**
 * Generate production daily plan and jobs
 */
contentEngineRoutes.post("/content-engine/plan/generate", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { date?: string; brands?: string[]; includeStories?: boolean };
  const targetDate = body.date || getIstDateString();
  const plan = await generateDailyPlan(
    {
      date: targetDate,
      brands: body.brands || ["Zawaago", "InnoTech"],
      includeStories: body.includeStories || false,
      dryRun: false,
      ai: c.env.AI
    },
    c.env.DB,
    c.env.ASSETS
  );

  return c.json({ ok: true, plan });
});

/**
 * Autonomous Daily Execution Queue:
 * Executes today's (IST) or given date's POST queue: Generate Media → Quality Gate → Ready → Schedule / Publish → History
 */
contentEngineRoutes.post("/content-engine/execute-daily-queue", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { date?: string; publishNow?: boolean; includeReels?: boolean };
  const targetDate = body.date || getIstDateString();
  const origin = new URL(c.req.url).origin;

  const summary = await executeDailyQueue(targetDate, c.env, {
    publishNow: body.publishNow !== false,
    includeReels: Boolean(body.includeReels),
    requestOrigin: origin
  });

  return c.json({ ok: true, ...summary });
});

/**
 * Execute a single planned item through the pipeline
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

  let planId = id;
  if (id.startsWith("job-")) {
    // Look up actual planId from D1 content_jobs first
    if (c.env.DB) {
      const row = (await c.env.DB.prepare("SELECT plan_id FROM content_jobs WHERE id = ? LIMIT 1")
        .bind(id)
        .first()
        .catch(() => null)) as { plan_id?: string } | null;
      if (row?.plan_id) planId = row.plan_id;
    }
    if (planId === id) planId = id.slice(4);
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
contentEngineRoutes.get("/content-engine/plans/:id", async (c) => {
  const id = c.req.param("id");
  let plan = getPlanById(id);
  if (!plan && c.env.DB) {
    plan = await getPlanFromD1(id, c.env.DB);
  }
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
 * Human Override: Approve plan (persists to D1)
 */
contentEngineRoutes.post("/content-engine/plans/:id/approve", async (c) => {
  const id = c.req.param("id");
  let plan = getPlanById(id);
  if (!plan && c.env.DB) plan = await getPlanFromD1(id, c.env.DB);
  if (!plan) return c.json({ ok: false, error: "Plan not found" }, 404);

  const updated = updatePlan(id, { status: "APPROVED", errorMessage: undefined });
  if (c.env.DB) await updatePlanInD1(id, { status: "APPROVED", errorMessage: undefined }, c.env.DB);
  return c.json({ ok: true, plan: updated, message: "Plan manually approved." });
});

/**
 * Human Override: Regenerate targeted component (persists to D1)
 */
contentEngineRoutes.post("/content-engine/plans/:id/regenerate", async (c) => {
  const id = c.req.param("id");
  let plan = getPlanById(id);
  if (!plan && c.env.DB) plan = await getPlanFromD1(id, c.env.DB);
  if (!plan) return c.json({ ok: false, error: "Plan not found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as {
    target?: "ALL" | "CAPTION_ONLY" | "IMAGE_ONLY" | "SCENE_ONLY";
    sceneNumber?: number;
  };
  const target = body.target || "ALL";

  const patch =
    target === "ALL"
      ? { status: "PLANNED" as const, generatedCaption: undefined, generatedImageUrl: undefined, errorMessage: undefined }
      : target === "CAPTION_ONLY"
      ? { generatedCaption: undefined, status: "PLANNED" as const, errorMessage: undefined }
      : { generatedImageUrl: undefined, status: "PLANNED" as const, errorMessage: undefined };

  const updated = updatePlan(id, patch);
  if (c.env.DB) await updatePlanInD1(id, patch, c.env.DB);

  return c.json({ ok: true, plan: updated, message: `Regeneration queued for target: ${target}` });
});

/**
 * Human Override: Reschedule (persists to D1)
 */
contentEngineRoutes.post("/content-engine/plans/:id/reschedule", async (c) => {
  const id = c.req.param("id");
  let plan = getPlanById(id);
  if (!plan && c.env.DB) plan = await getPlanFromD1(id, c.env.DB);
  if (!plan) return c.json({ ok: false, error: "Plan not found" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { scheduledFor?: string };
  if (!body.scheduledFor) return c.json({ ok: false, error: "Missing scheduledFor timestamp" }, 400);

  const updated = updatePlan(id, { scheduledFor: body.scheduledFor, errorMessage: undefined });
  if (c.env.DB) await updatePlanInD1(id, { scheduledFor: body.scheduledFor, errorMessage: undefined }, c.env.DB);
  if (c.env.ASSETS) {
    try {
      const existing = await c.env.ASSETS.get(`schedules/${id}.json`);
      if (existing) {
        const rec = (await existing.json()) as Record<string, unknown>;
        if (rec.status === "scheduled" || rec.status === "failed") {
          await c.env.ASSETS.put(
            `schedules/${id}.json`,
            JSON.stringify({ ...rec, scheduledAt: body.scheduledFor, status: "scheduled", nextRetryAt: undefined, error: undefined }),
            { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } }
          );
        }
      }
    } catch (err) {
      console.warn("R2 schedule reschedule sync warning:", err);
    }
  }
  return c.json({ ok: true, plan: updated, message: "Plan rescheduled." });
});

/**
 * Human Override: Cancel plan (persists to D1)
 */
contentEngineRoutes.post("/content-engine/plans/:id/cancel", async (c) => {
  const id = c.req.param("id");
  let plan = getPlanById(id);
  if (!plan && c.env.DB) plan = await getPlanFromD1(id, c.env.DB);
  if (!plan) return c.json({ ok: false, error: "Plan not found" }, 404);

  const updated = updatePlan(id, { status: "CANCELLED" });
  if (c.env.DB) await updatePlanInD1(id, { status: "CANCELLED" }, c.env.DB);
  if (c.env.ASSETS) {
    try {
      const existing = await c.env.ASSETS.get(`schedules/${id}.json`);
      if (existing) {
        const rec = (await existing.json()) as Record<string, unknown>;
        if (rec.status !== "published") {
          await c.env.ASSETS.put(
            `schedules/${id}.json`,
            JSON.stringify({ ...rec, status: "cancelled" }),
            { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } }
          );
        }
      }
    } catch (err) {
      console.warn("R2 schedule cancel sync warning:", err);
    }
  }
  return c.json({ ok: true, plan: updated, message: "Plan cancelled." });
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
