import type { ContentJob, JobStatus, PostPlan, ReelPlan, UnifiedContentPlan } from "./types";
import { evaluateContentQuality } from "./quality-gate";
import { buildCaptionPrompt, buildImagePrompt } from "./prompt-engine";
import { transitionJobState, getJob, createContentJob } from "./job-orchestrator";
import { updatePlan, getPlanById } from "./autonomous-planner";
import { savePlanToD1, updatePlanInD1, getPlanFromD1 } from "./db";
import {
  generateCaption,
  getPageConfig,
  getPageToken,
  imageBytesFromResult,
  postImageToFacebook,
  postToFacebook,
  storeImage,
  generateProductionImage,
  type Brief
} from "../api";
import { publishFacebookReel } from "../reels";
import { synthesizeReelNarration } from "../reel-lab";
import { renderReelInContainer } from "../reel-renderer";
import { writeHistory, sanitizeHistoryError } from "../history";

export interface ExecutionOptions {
  publishNow?: boolean;
  requestOrigin?: string;
  forceRegenerate?: boolean;
}

export interface ExecutionResult {
  ok: boolean;
  planId: string;
  brand: string;
  format: string;
  stage: string;
  status: JobStatus;
  caption?: string;
  mediaUrl?: string;
  qualityScore?: number;
  facebookPostId?: string;
  publishedAt?: string;
  scheduledAt?: string;
  message?: string;
  error?: string;
}

/**
 * Executes a single content plan through the complete autonomous pipeline:
 * Plan → Generate Media → Quality Gate → Ready → Schedule / Facebook Publish → History
 *
 * Adheres strictly to:
 * 1. Never regenerate already completed successful stages unnecessarily.
 * 2. Never duplicate Facebook publishing.
 * 3. Safe retry from failed step.
 */
export async function executePlanItem(
  planId: string,
  env: any,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  // 1. Retrieve plan from memory or D1
  let plan = getPlanById(planId);
  if (!plan && env.DB) {
    plan = await getPlanFromD1(planId, env.DB);
  }
  if (!plan) {
    return {
      ok: false,
      planId,
      brand: "Unknown",
      format: "Unknown",
      stage: "FETCH_PLAN",
      status: "FAILED",
      error: `Plan not found: ${planId}`
    };
  }

  // Durable idempotency: once an item is scheduled, do not regenerate or overwrite it on every cron tick.
  if (plan.status === "SCHEDULED") {
    return {
      ok: true, planId: plan.id, brand: plan.brand, format: plan.format,
      stage: "ALREADY_SCHEDULED", status: "SCHEDULED", scheduledAt: plan.scheduledFor,
      mediaUrl: (plan as any).generatedImageUrl || (plan as any).generatedVideoUrl,
      message: "Skipping already scheduled content."
    };
  }

  // Idempotency Guard: Never duplicate Facebook publishing
  if (
    plan.status === "PUBLISHED" ||
    (plan.format === "POST" && (plan as PostPlan).facebookPostId) ||
    (plan.format === "REEL" && ((plan as ReelPlan).facebookPostId || (plan as ReelPlan).facebookVideoId))
  ) {
    const existingPostId =
      (plan as any).facebookPostId || (plan as any).facebookVideoId || "already-published";
    return {
      ok: true,
      planId: plan.id,
      brand: plan.brand,
      format: plan.format,
      stage: "IDEMPOTENCY_CHECK",
      status: "PUBLISHED",
      facebookPostId: existingPostId,
      publishedAt: plan.publishedAt,
      message: `Plan was already successfully published (ID: ${existingPostId}). Skipping duplicate publishing.`
    };
  }

  const job = getJob(`job-${plan.id}`) || {
    id: `job-${plan.id}`,
    planId: plan.id,
    brand: plan.brand,
    format: plan.format,
    state: plan.status,
    retryCount: 0,
    maxRetries: 3,
    currentStep: "EXECUTING",
    logs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    if (plan.format === "POST") {
      return await executePostPlan(plan as PostPlan, job, env, options);
    } else if (plan.format === "REEL") {
      return await executeReelPlan(plan as ReelPlan, job, env, options);
    } else {
      return {
        ok: false,
        planId: plan.id,
        brand: plan.brand,
        format: plan.format,
        stage: "UNSUPPORTED_FORMAT",
        status: "FAILED",
        error: `Format ${plan.format} execution is not supported.`
      };
    }
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await transitionJobState(
      job.id,
      "FAILED",
      "EXECUTION_ERROR",
      `Execution failed: ${errorMsg}`,
      { errorMessage: errorMsg, retryCount: job.retryCount + 1 },
      env.DB
    );
    updatePlan(plan.id, { status: "FAILED" });
    if (env.DB) {
      await updatePlanInD1(plan.id, { status: "FAILED" }, env.DB);
    }
    return {
      ok: false,
      planId: plan.id,
      brand: plan.brand,
      format: plan.format,
      stage: "EXECUTION",
      status: "FAILED",
      error: errorMsg
    };
  }
}

/**
 * Autonomous execution for POST format
 */
async function executePostPlan(
  plan: PostPlan,
  job: ContentJob,
  env: any,
  options: ExecutionOptions
): Promise<ExecutionResult> {
  const reqMock = { url: options.requestOrigin || "https://studio.local" } as Request;
  let caption = plan.generatedCaption;
  let imageUrl = plan.generatedImageUrl;

  // Step 1: Generate Caption (Skip if already completed unless forceRegenerate)
  if (!caption || options.forceRegenerate) {
    await transitionJobState(
      job.id,
      "GENERATING",
      "GENERATE_CAPTION",
      `Generating social caption for ${plan.brand} on '${plan.topic}'`,
      {},
      env.DB
    );

    const brief: Brief = {
      topic: `${plan.topic} (${plan.angle})`,
      pageName: plan.brand,
      contentType: plan.pillar,
      tone: plan.language.toLowerCase().includes("hinglish") ? "Professional Hinglish" : "Professional English",
      language: plan.language,
      audience: plan.targetAudience,
      cta: plan.cta,
      customPrompt: plan.hook
    };

    if (env.AI) {
      try {
        const genRes = await generateCaption(env, brief);
        caption = genRes.caption;
      } catch (aiErr) {
        console.warn("AI caption generation warning:", aiErr);
        caption = `${plan.hook}\n\n${plan.captionBrief}\n\nKey Takeaway: ${plan.topic} is changing how we approach modern business automation.\n\n${plan.cta}\n\n#${plan.brand} #${plan.pillar.replace(/[^a-zA-Z0-9]/g, "")}`;
      }
    } else {
      caption = `${plan.hook}\n\n${plan.captionBrief}\n\nKey Takeaway: Actionable efficiency through intelligent automation.\n\n${plan.cta}\n\n#${plan.brand} #${plan.pillar.replace(/[^a-zA-Z0-9]/g, "")}`;
    }

    plan.generatedCaption = caption;
    updatePlan(plan.id, { generatedCaption: caption });
    if (env.DB) {
      await updatePlanInD1(plan.id, { generatedCaption: caption }, env.DB);
    }
  }

  // Step 2: Generate Visual (Skip if already completed unless forceRegenerate)
  if (!imageUrl || options.forceRegenerate) {
    await transitionJobState(
      job.id,
      "GENERATING",
      "GENERATE_IMAGE",
      `Generating image asset via Flux for ${plan.brand}`,
      { caption },
      env.DB
    );

    const imgPrompt = buildImagePrompt(plan.creativeDirection, plan.brand);

    if (env.AI && env.ASSETS) {
      try {
        const brief: Brief = {
      topic: `${plan.topic} · scene ${scene.scene}`,
      pageName: plan.brand,
      contentType: "Educational Reel Scene",
      tone: plan.language.toLowerCase().includes("hinglish") ? "Professional Hinglish" : "Professional English",
      language: plan.language,
      audience: plan.targetAudience,
      visualStyle: "Premium Editorial Cinematic",
      aspectRatio: "Portrait 9:16",
      branding: "No branding",
      logoPosition: "Bottom Right",
      cta: "None",
      customPrompt: `${scene.visualPrompt} Clean artwork only. No text, logos, letters, numbers, subtitles or watermarks. Designed for a vertical 9:16 educational Reel.`
    };
    const generated = await generateProductionImage(env, brief, { url: origin } as Request);
    const url = generated.imageUrl;
    sceneUrls.push(url);
  }
  const narration = plan.scenes.map(s => s.narration).join(" ").trim();
  const tts = await synthesizeReelNarration(env, narration, plan.language, "shubh");
  if (tts.bytes.length < 1000) throw new Error("Voice generation returned no usable audio.");
  const audioKey = `generated/${safeBrand}/reels/${plan.id}-voice.${tts.contentType === "audio/mpeg" ? "mp3" : "wav"}`;
  await env.ASSETS.put(audioKey, tts.bytes, { httpMetadata: { contentType: tts.contentType }, customMetadata: { planId: plan.id, source: "autonomous-content-engine" } });
  const audioUrl = `${origin}/api/autoposter/assets/${encodeURIComponent(audioKey)}`;
  const rendered = await renderReelInContainer(env, { planId: plan.id, scenes: plan.scenes.map((s, i) => ({ imageUrl: sceneUrls[i], durationSeconds: s.durationSeconds, caption: s.captionOverlayText })), audioUrl });
  const videoKey = `generated/${safeBrand}/reels/${plan.id}.mp4`;
  await env.ASSETS.put(videoKey, rendered, { httpMetadata: { contentType: "video/mp4", cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { planId: plan.id, brand: plan.brand, source: "autonomous-content-engine", format: "mp4" } });
  const head = await env.ASSETS.head(videoKey);
  if (!head || head.size < 1000 || head.httpMetadata?.contentType !== "video/mp4") throw new Error("Rendered Reel MP4 failed R2 verification.");
  return `${origin}/api/autoposter/assets/${encodeURIComponent(videoKey)}`;
}
/**
 * Autonomous execution for REEL format
 */
async function executeReelPlan(
  plan: ReelPlan,
  job: ContentJob,
  env: any,
  options: ExecutionOptions
): Promise<ExecutionResult> {
  const reqMock = { url: options.requestOrigin || "https://studio.local" } as Request;
  let videoUrl = plan.generatedVideoUrl;

  // Step 1: Verify Scene Visuals & Prompts
  await transitionJobState(
    job.id,
    "GENERATING",
    "VERIFY_STORYBOARD",
    `Synthesizing 5-scene storyboard visuals for ${plan.brand} Reel: '${plan.topic}'`,
    {},
    env.DB
  );

  // Step 2: Generate scenes, voice, and render a real MP4 in the server-side renderer
  if (!videoUrl || options.forceRegenerate) {
    await transitionJobState(job.id, "GENERATING", "RENDER_REEL", "Generating scenes, voice and production MP4", {}, env.DB);
    videoUrl = await renderAutonomousReel(plan, env, reqMock.url);
    plan.generatedVideoUrl = videoUrl;
    updatePlan(plan.id, { generatedVideoUrl: videoUrl, status: "GENERATED" });
    if (env.DB) await updatePlanInD1(plan.id, { generatedVideoUrl: videoUrl, status: "GENERATED" }, env.DB);
  }

  // Step 3: Quality Gate Evaluation
  await transitionJobState(
    job.id,
    "QUALITY_CHECK",
    "QUALITY_GATE_REEL",
    "Evaluating Reel pacing, hook, and narrative structure",
    { videoUrl },
    env.DB
  );

  const qualityResult = evaluateContentQuality({
    plan,
    generatedScenes: plan.scenes.map((s, i) => ({ sceneNumber: i + 1, narration: s.narration, imageUrl: s.imageUrl })),
    freshnessScore: 0.95
  });
  plan.qualityScore = qualityResult.overallScore;

  if (!qualityResult.passed) {
    await transitionJobState(job.id, "FAILED", "QUALITY_GATE_FAILED", qualityResult.retryDirective?.reason || "Generated content failed Quality Gate.", { errorMessage: "Quality Gate failed", retryCount: job.retryCount + 1 }, env.DB);
    updatePlan(plan.id, { status: "FAILED", qualityScore: plan.qualityScore });
    if (env.DB) await updatePlanInD1(plan.id, { status: "FAILED", qualityScore: plan.qualityScore }, env.DB);
    return { ok: false, planId: plan.id, brand: plan.brand, format: "REEL", stage: "QUALITY_GATE", status: "FAILED", mediaUrl: videoUrl, qualityScore: plan.qualityScore, error: qualityResult.retryDirective?.reason || "Quality Gate failed." };
  }

  // Step 4: Ready State
  plan.status = "READY";
  updatePlan(plan.id, { status: "READY", qualityScore: plan.qualityScore });
  if (env.DB) {
    await updatePlanInD1(plan.id, { status: "READY", qualityScore: plan.qualityScore }, env.DB);
  }

  // Step 5: Schedule or Publish Now
  const shouldPublishImmediately =
    options.publishNow || new Date(plan.scheduledFor).getTime() <= Date.now() + 60_000;

  if (shouldPublishImmediately) {
    return await publishReelToFacebook(plan, job, env, videoUrl);
  } else {
    // Schedule Reel
    await transitionJobState(
      job.id,
      "SCHEDULED",
      "SCHEDULED_REEL",
      `Reel scheduled for ${plan.scheduledFor}`,
      { videoUrl },
      env.DB
    );
    plan.status = "SCHEDULED";
    updatePlan(plan.id, { status: "SCHEDULED" });
    if (env.DB) {
      await updatePlanInD1(plan.id, { status: "SCHEDULED" }, env.DB);
    }

    if (!env.ASSETS) throw new Error("R2 asset storage is required for scheduled Reel publishing.");
    {
      try {
        const scheduleRecord = {
          id: plan.id,
          pageName: plan.brand,
          caption: `${plan.hook}\n\n${plan.title}\n\n${plan.cta}`,
          title: plan.title,
          videoUrl,
          mediaType: "video",
          withImage: false,
          scheduledAt: plan.scheduledFor,
          status: "scheduled",
          createdAt: new Date().toISOString()
        };
        await env.ASSETS.put(`schedules/${plan.id}.json`, JSON.stringify(scheduleRecord), {
          httpMetadata: { contentType: "application/json" }
        });
      } catch (schedErr) {
        throw new Error(`Reel scheduler persistence failed: ${schedErr instanceof Error ? schedErr.message : String(schedErr)}`);
      }
    }

    return {
      ok: true,
      planId: plan.id,
      brand: plan.brand,
      format: "REEL",
      stage: "SCHEDULED",
      status: "SCHEDULED",
      mediaUrl: videoUrl,
      qualityScore: plan.qualityScore,
      scheduledAt: plan.scheduledFor,
      message: `Reel successfully planned, synthesized, verified and scheduled for ${plan.scheduledFor}.`
    };
  }
}

/**
 * Handles Facebook publishing for Post format with real FB API and fallback simulation
 */
async function publishPostToFacebook(
  plan: PostPlan,
  job: ContentJob,
  env: any,
  request: Request,
  caption: string,
  imageUrl?: string
): Promise<ExecutionResult> {
  // Idempotency check before publishing
  if (plan.facebookPostId) {
    return {
      ok: true,
      planId: plan.id,
      brand: plan.brand,
      format: "POST",
      stage: "ALREADY_PUBLISHED",
      status: "PUBLISHED",
      facebookPostId: plan.facebookPostId,
      publishedAt: plan.publishedAt,
      message: `Skipping publish: Post already published to Facebook with ID ${plan.facebookPostId}.`
    };
  }

  await transitionJobState(
    job.id,
    "PUBLISHING",
    "PUBLISHING_TO_FACEBOOK",
    `Publishing to Facebook Page (${plan.brand})`,
    { caption, assetUrl: imageUrl },
    env.DB
  );

  let fbPostId = "";
  const now = new Date().toISOString();

  try {
    const pageConfig = getPageConfig(plan.brand, env);
    const pageToken = getPageToken(plan.brand, env);

    if (imageUrl && !imageUrl.includes("placeholder")) {
      const fbRes = await postImageToFacebook(caption, imageUrl, pageConfig.id, pageToken, env, request);
      fbPostId = String(fbRes.id || fbRes.post_id || "");
    } else {
      const fbRes = await postToFacebook(caption, pageConfig.id, pageToken);
      fbPostId = String(fbRes.id || "");
    }
  } catch (fbErr: any) {
    const errorMsg = fbErr instanceof Error ? fbErr.message : String(fbErr);
    // If Facebook tokens are missing or mock in local development environment, record graceful simulation
    if (
      errorMsg.includes("not configured") ||
      errorMsg.includes("rejected the Page token") ||
      errorMsg.includes("fetch failed") ||
      errorMsg.includes("400") ||
      errorMsg.includes("401") ||
      errorMsg.includes("403")
    ) {
      throw new Error(`Facebook Post publish failed: ${errorMsg}`);
    } else {
      throw fbErr;
    }
  }

  // Update plan and job with publication record
  plan.facebookPostId = fbPostId;
  plan.publishedAt = now;
  plan.status = "PUBLISHED";
  updatePlan(plan.id, {
    facebookPostId: fbPostId,
    publishedAt: now,
    status: "PUBLISHED"
  });
  if (env.DB) {
    await updatePlanInD1(
      plan.id,
      {
        facebookPostId: fbPostId,
        publishedAt: now,
        status: "PUBLISHED"
      },
      env.DB
    );
  }

  await transitionJobState(
    job.id,
    "PUBLISHED",
    "PUBLISHED",
    `Successfully published to Facebook Page ${plan.brand} (Post ID: ${fbPostId})`,
    { facebookPostId: fbPostId, publishedAt: now },
    env.DB
  );

  // Record history in D1 and R2 using existing publishing system
  try {
    await writeHistory(env, {
      id: plan.id,
      pageName: plan.brand as any,
      pageId: `page-${plan.brand.toLowerCase()}`,
      contentType: imageUrl && !imageUrl.includes("placeholder") ? "image" : "text",
      caption,
      ...(imageUrl ? { imageUrl } : {}),
      facebookPostId: fbPostId,
      status: "published",
      createdAt: now
    });
  } catch (histErr) {
    console.warn("writeHistory warning:", histErr);
  }

  return {
    ok: true,
    planId: plan.id,
    brand: plan.brand,
    format: "POST",
    stage: "PUBLISHED",
    status: "PUBLISHED",
    caption,
    mediaUrl: imageUrl,
    qualityScore: plan.qualityScore,
    facebookPostId: fbPostId,
    publishedAt: now,
    message: `Post successfully published to ${plan.brand} (FB ID: ${fbPostId}).`
  };
}

/**
 * Handles Facebook publishing for Reel format with real FB API and fallback simulation
 */
async function publishReelToFacebook(
  plan: ReelPlan,
  job: ContentJob,
  env: any,
  videoUrl: string
): Promise<ExecutionResult> {
  if (plan.facebookPostId || plan.facebookVideoId) {
    const existingId = plan.facebookVideoId || plan.facebookPostId;
    return {
      ok: true,
      planId: plan.id,
      brand: plan.brand,
      format: "REEL",
      stage: "ALREADY_PUBLISHED",
      status: "PUBLISHED",
      facebookPostId: existingId,
      publishedAt: plan.publishedAt,
      message: `Skipping publish: Reel already published to Facebook with ID ${existingId}.`
    };
  }

  await transitionJobState(
    job.id,
    "PUBLISHING",
    "PUBLISHING_REEL_TO_FACEBOOK",
    `Publishing Reel to Facebook Page (${plan.brand})`,
    { videoUrl },
    env.DB
  );

  let fbVideoId = "";
  const now = new Date().toISOString();
  const caption = `${plan.hook}\n\n${plan.title}\n\n${plan.cta}`;

  try {
    const result = await publishFacebookReel(env, plan.brand as any, videoUrl, caption, plan.title);
    fbVideoId = String(result.videoId || "");
  } catch (reelErr: any) {
    const errorMsg = reelErr instanceof Error ? reelErr.message : String(reelErr);
    if (
      errorMsg.includes("not configured") ||
      errorMsg.includes("rejected the Page token") ||
      errorMsg.includes("upload failed") ||
      errorMsg.includes("fetch failed")
    ) {
      throw new Error(`Facebook Reel publish failed: ${errorMsg}`);
    } else {
      throw reelErr;
    }
  }

  plan.facebookVideoId = fbVideoId;
  plan.facebookPostId = fbVideoId;
  plan.publishedAt = now;
  plan.status = "PUBLISHED";
  updatePlan(plan.id, {
    facebookVideoId: fbVideoId,
    facebookPostId: fbVideoId,
    publishedAt: now,
    status: "PUBLISHED"
  });
  if (env.DB) {
    await updatePlanInD1(
      plan.id,
      {
        facebookVideoId: fbVideoId,
        facebookPostId: fbVideoId,
        publishedAt: now,
        status: "PUBLISHED"
      },
      env.DB
    );
  }

  await transitionJobState(
    job.id,
    "PUBLISHED",
    "PUBLISHED",
    `Successfully published Reel to Facebook Page ${plan.brand} (Video ID: ${fbVideoId})`,
    { facebookPostId: fbVideoId, publishedAt: now },
    env.DB
  );

  try {
    await writeHistory(env, {
      id: plan.id,
      pageName: plan.brand as any,
      pageId: `page-${plan.brand.toLowerCase()}`,
      contentType: "reel",
      caption,
      videoUrl,
      facebookPostId: fbVideoId,
      status: "published",
      createdAt: now
    });
  } catch (histErr) {
    console.warn("writeHistory Reel warning:", histErr);
  }

  return {
    ok: true,
    planId: plan.id,
    brand: plan.brand,
    format: "REEL",
    stage: "PUBLISHED",
    status: "PUBLISHED",
    mediaUrl: videoUrl,
    qualityScore: plan.qualityScore,
    facebookPostId: fbVideoId,
    publishedAt: now,
    message: `Reel successfully published to ${plan.brand} (FB Video ID: ${fbVideoId}).`
  };
}

/**
 * Autonomous Daily Execution Queue:
 * Finds all plans for target date (e.g. today) and runs their pipeline sequentially.
 */
export async function executeDailyQueue(
  dateStr: string,
  env: any,
  options: ExecutionOptions = {}
): Promise<{
  date: string;
  totalItems: number;
  successful: number;
  failed: number;
  skipped: number;
  results: ExecutionResult[];
}> {
  // Retrieve all plans for this date
  let plans = (env.DB ? await (await import("./db")).loadPlansFromD1(env.DB) : []).filter(
    (p: any) => p.scheduledFor && p.scheduledFor.startsWith(dateStr)
  );

  if (plans.length === 0) {
    // Check in-memory plans
    plans = (await import("./autonomous-planner")).listPlans().filter(
      (p) => p.scheduledFor && p.scheduledFor.startsWith(dateStr)
    );
  }

  const results: ExecutionResult[] = [];
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  for (const plan of plans) {
    const res = await executePlanItem(plan.id, env, options);
    results.push(res);
    if (res.ok) {
      if (res.stage === "IDEMPOTENCY_CHECK") {
        skipped++;
      } else {
        successful++;
      }
    } else {
      failed++;
    }
  }

  return {
    date: dateStr,
    totalItems: plans.length,
    successful,
    failed,
    skipped,
    results
  };
}
