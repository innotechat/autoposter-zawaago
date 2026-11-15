import type { ContentJob, JobStatus, PostPlan, ReelPlan, UnifiedContentPlan } from "./types";
import { evaluateContentQuality } from "./quality-gate";
import { buildImagePrompt } from "./prompt-engine";
import { getOrCreateJobForPlan, transitionJobState } from "./job-orchestrator";
import { ensureRollingPlans, updatePlan, getPlanById } from "./autonomous-planner";
import {
  claimPlanForStageD1,
  getPlanFromD1,
  loadPlansFromD1,
  recoverStaleGeneratingPlansD1,
  saveQualityCheckToD1,
  updatePlanInD1
} from "./db";
import { markContentMemoryPublished } from "./content-memory";
import {
  getIstDateString,
  loadEngineSettings,
  resolvePublicOrigin,
  saveEngineSettings
} from "./settings";
import {
  generateCaption,
  getPageConfig,
  getPageToken,
  imageBytesFromResult,
  postImageToFacebook,
  storeImage,
  type Brief
} from "../api";
import { publishFacebookReel } from "../reels";
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

function isPermanentFailure(errorMsg: string): boolean {
  const lower = errorMsg.toLowerCase();
  return (
    lower.includes("token is not configured") ||
    lower.includes("page id is not configured") ||
    lower.includes("invalid or expired") ||
    lower.includes("permissions for the selected page") ||
    lower.includes("quality gate rejected") ||
    lower.includes("public worker origin is not configured") ||
    lower.includes("unsupported")
  );
}

function isInvalidOrPlaceholderMediaUrl(url?: string): boolean {
  if (!url) return true;
  if (!/^https?:\/\//i.test(url)) return true;
  if (url.includes("placeholder-")) return true;
  if (url.includes("studio.local")) return true;
  if (url.includes("assets.local")) return true;
  if (url.startsWith("data:")) return true;
  return false;
}

/**
 * Executes a single content plan through the complete autonomous pipeline:
 * Plan → Generate Media → Quality Gate → Ready → Schedule / Facebook Publish → History
 *
 * Adheres strictly to:
 * 1. Never regenerate already completed successful stages unnecessarily.
 * 2. Never duplicate Facebook publishing.
 * 3. Safe retry from failed step with backoff.
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

  const job = await getOrCreateJobForPlan(plan, env.DB);

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
    const errorMsg = sanitizeHistoryError(err instanceof Error ? err.message : String(err));
    const nextRetryCount = Number(plan.retryCount ?? job.retryCount ?? 0) + 1;
    const maxRetries = Number(job.maxRetries || 3);
    const shouldRetry = !isPermanentFailure(errorMsg) && nextRetryCount < maxRetries;
    const nextStatus: JobStatus = shouldRetry ? "RETRYING" : "FAILED";
    const nextRetryAt = shouldRetry
      ? new Date(Date.now() + nextRetryCount * 3 * 60_000).toISOString()
      : undefined;

    await transitionJobState(
      job.id,
      nextStatus,
      "EXECUTION_ERROR",
      `${shouldRetry ? `Retry ${nextRetryCount}/${maxRetries} scheduled` : "Execution failed"}: ${errorMsg}`,
      {
        planId: plan.id,
        brand: plan.brand,
        format: plan.format,
        errorMessage: errorMsg,
        retryCount: nextRetryCount,
        nextRetryAt: nextRetryAt || null
      },
      env.DB
    );

    const planPatch: Partial<UnifiedContentPlan> = {
      status: nextStatus,
      retryCount: nextRetryCount,
      nextRetryAt: nextRetryAt || undefined,
      errorMessage: errorMsg,
      processingStartedAt: undefined
    };
    updatePlan(plan.id, planPatch);
    if (env.DB) {
      await updatePlanInD1(plan.id, planPatch, env.DB);
    }

    return {
      ok: false,
      planId: plan.id,
      brand: plan.brand,
      format: plan.format,
      stage: "EXECUTION",
      status: nextStatus,
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
  const origin = await resolvePublicOrigin(env, options.requestOrigin);
  if (!origin) {
    throw new Error(
      "Public Worker origin is not configured yet. Open /content-engine once in a browser or set PUBLIC_ORIGIN."
    );
  }
  const reqMock = { url: origin } as Request;
  let caption = plan.generatedCaption;
  let imageUrl = plan.generatedImageUrl;

  const generatePostCaption = async (qualityFeedback?: string) => {
    if (!env.AI) {
      throw new Error("Workers AI binding is not configured for caption generation.");
    }
    const brief: Brief = {
      topic: `${plan.topic} (${plan.angle})`,
      pageName: plan.brand,
      contentType: plan.pillar,
      tone: plan.language.toLowerCase().includes("hinglish") ? "Professional Hinglish" : "Professional English",
      language: plan.language,
      audience: plan.targetAudience,
      cta: plan.cta,
      customPrompt: qualityFeedback ? `${plan.hook}\nFix required: ${qualityFeedback}` : plan.hook
    };
    const genRes = await generateCaption(env, brief);
    if (!genRes?.caption || genRes.caption.trim().length < 60) {
      throw new Error("Workers AI returned an empty or too-short caption.");
    }
    return genRes.caption.trim();
  };

  const generatePostImage = async (extraDirection?: string) => {
    if (!env.AI || !env.ASSETS) {
      throw new Error("Workers AI or R2 ASSETS binding is not configured for daily image generation.");
    }
    const basePrompt = buildImagePrompt(plan.creativeDirection, plan.brand);
    const imgPrompt = extraDirection ? `${basePrompt} ${extraDirection}` : basePrompt;
    const aiResult: any = await env.AI.run("@cf/black-forest-labs/flux-1-schnell" as any, {
      prompt: imgPrompt,
      steps: 8
    });
    const bytes = imageBytesFromResult(aiResult);
    if (!bytes || bytes.length <= 1000) {
      throw new Error("Flux image generation returned empty or invalid bytes.");
    }
    return await storeImage(env, bytes, reqMock, plan.brand);
  };

  // Step 1: Generate Caption (Skip if already completed unless forceRegenerate)
  if (!caption || options.forceRegenerate) {
    await transitionJobState(
      job.id,
      "GENERATING",
      "GENERATE_CAPTION",
      `Generating social caption for ${plan.brand} on '${plan.topic}'`,
      { planId: plan.id, brand: plan.brand, format: plan.format },
      env.DB
    );

    caption = await generatePostCaption();
    plan.generatedCaption = caption;
    updatePlan(plan.id, { generatedCaption: caption, errorMessage: undefined });
    if (env.DB) {
      await updatePlanInD1(plan.id, { generatedCaption: caption, errorMessage: undefined }, env.DB);
    }
  }

  // Step 2: Generate Visual (Skip if already valid R2 asset unless forceRegenerate)
  if (isInvalidOrPlaceholderMediaUrl(imageUrl) || options.forceRegenerate) {
    await transitionJobState(
      job.id,
      "GENERATING",
      "GENERATE_IMAGE",
      `Generating daily image asset via Flux for ${plan.brand}`,
      { planId: plan.id, brand: plan.brand, format: plan.format, caption },
      env.DB
    );

    imageUrl = await generatePostImage();
    plan.generatedImageUrl = imageUrl;
    updatePlan(plan.id, { generatedImageUrl: imageUrl, errorMessage: undefined });
    if (env.DB) {
      await updatePlanInD1(plan.id, { generatedImageUrl: imageUrl, errorMessage: undefined }, env.DB);
    }
  }

  // Step 3: Quality Gate Evaluation + Targeted Retry Loop
  await transitionJobState(
    job.id,
    "QUALITY_CHECK",
    "QUALITY_GATE",
    "Evaluating generated caption & visual quality standards",
    { caption, assetUrl: imageUrl },
    env.DB
  );

  let qualityResult = evaluateContentQuality({
    plan,
    generatedCaption: caption,
    generatedImageUrl: imageUrl,
    freshnessScore: 0.95
  });
  await saveQualityCheckToD1(qualityResult, env.DB);

  if (!qualityResult.passed && qualityResult.retryDirective) {
    const target = qualityResult.retryDirective.target;
    await transitionJobState(
      job.id,
      "QUALITY_CHECK",
      "QUALITY_GATE_RETRY",
      `Quality Gate retrying (${target}): ${qualityResult.retryDirective.reason}`,
      { caption, assetUrl: imageUrl },
      env.DB
    );

    if (target === "CAPTION_ONLY" || target === "ALL") {
      caption = await generatePostCaption(qualityResult.retryDirective.recommendedAdjustment);
      plan.generatedCaption = caption;
      updatePlan(plan.id, { generatedCaption: caption });
      if (env.DB) await updatePlanInD1(plan.id, { generatedCaption: caption }, env.DB);
    }

    if (target === "IMAGE_ONLY" || target === "ALL") {
      imageUrl = await generatePostImage(qualityResult.retryDirective.recommendedAdjustment);
      plan.generatedImageUrl = imageUrl;
      updatePlan(plan.id, { generatedImageUrl: imageUrl });
      if (env.DB) await updatePlanInD1(plan.id, { generatedImageUrl: imageUrl }, env.DB);
    }

    qualityResult = evaluateContentQuality({
      plan,
      generatedCaption: caption,
      generatedImageUrl: imageUrl,
      freshnessScore: 0.95
    });
    await saveQualityCheckToD1(qualityResult, env.DB);
  }

  plan.qualityScore = qualityResult.overallScore;
  if (!qualityResult.passed && qualityResult.overallScore < 6.5) {
    throw new Error(
      `Quality Gate rejected content (${qualityResult.overallScore.toFixed(1)}/10): ${
        qualityResult.retryDirective?.reason || "Did not meet minimum quality threshold."
      }`
    );
  }

  // Step 4: Ready State
  plan.status = "READY";
  updatePlan(plan.id, {
    status: "READY",
    qualityScore: plan.qualityScore,
    processingStartedAt: undefined,
    errorMessage: undefined
  });
  if (env.DB) {
    await updatePlanInD1(
      plan.id,
      {
        status: "READY",
        qualityScore: plan.qualityScore,
        processingStartedAt: undefined,
        errorMessage: undefined
      },
      env.DB
    );
  }

  // Step 5: Schedule or Publish Now
  const shouldPublishImmediately =
    options.publishNow || new Date(plan.scheduledFor).getTime() <= Date.now() + 60_000;

  if (shouldPublishImmediately) {
    return await publishPostToFacebook(plan, job, env, reqMock, caption, imageUrl);
  } else {
    const pageConfig = getPageConfig(plan.brand, env);

    await transitionJobState(
      job.id,
      "SCHEDULED",
      "SCHEDULED",
      `Post ready and scheduled for ${plan.scheduledFor}`,
      { caption, assetUrl: imageUrl, errorMessage: undefined, nextRetryAt: null },
      env.DB
    );
    plan.status = "SCHEDULED";
    updatePlan(plan.id, {
      status: "SCHEDULED",
      retryCount: 0,
      nextRetryAt: undefined,
      errorMessage: undefined,
      processingStartedAt: undefined
    });
    if (env.DB) {
      await updatePlanInD1(
        plan.id,
        {
          status: "SCHEDULED",
          retryCount: 0,
          nextRetryAt: undefined,
          errorMessage: undefined,
          processingStartedAt: undefined
        },
        env.DB
      );
    }

    // Persist in R2 scheduler queue so processDueSchedules() publishes at scheduledFor
    if (env.ASSETS) {
      const scheduleRecord = {
        id: plan.id,
        contentPlanId: plan.id,
        pageName: pageConfig.name,
        pageId: pageConfig.id,
        caption,
        imageUrl,
        withImage: Boolean(imageUrl && !isInvalidOrPlaceholderMediaUrl(imageUrl)),
        scheduledAt: plan.scheduledFor,
        status: "scheduled",
        retryCount: 0,
        createdAt: new Date().toISOString()
      };
      await env.ASSETS.put(`schedules/${plan.id}.json`, JSON.stringify(scheduleRecord), {
        httpMetadata: { contentType: "application/json", cacheControl: "no-store" }
      });
    }

    return {
      ok: true,
      planId: plan.id,
      brand: plan.brand,
      format: "POST",
      stage: "SCHEDULED",
      status: "SCHEDULED",
      caption,
      mediaUrl: imageUrl,
      qualityScore: plan.qualityScore,
      scheduledAt: plan.scheduledFor,
      message: `Post generated, passed Quality Gate (${plan.qualityScore?.toFixed(1)}/10), and scheduled for ${plan.scheduledFor}.`
    };
  }
}

/**
 * Autonomous execution for REEL format (preserved untouched per user instruction;
 * only fixed Job initialization so manual triggers don't throw Job not found)
 */
async function executeReelPlan(
  plan: ReelPlan,
  job: ContentJob,
  env: any,
  options: ExecutionOptions
): Promise<ExecutionResult> {
  const origin = await resolvePublicOrigin(env, options.requestOrigin);
  const reqMock = { url: origin || "https://studio.local" } as Request;
  let videoUrl = plan.generatedVideoUrl;

  await transitionJobState(
    job.id,
    "GENERATING",
    "VERIFY_STORYBOARD",
    `Synthesizing 5-scene storyboard visuals for ${plan.brand} Reel: '${plan.topic}'`,
    { planId: plan.id, brand: plan.brand, format: plan.format },
    env.DB
  );

  if (!videoUrl || options.forceRegenerate) {
    if (env.ASSETS) {
      const safeBrand = plan.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const videoKey = `generated/${safeBrand}/reel-${plan.id}.mp4`;
      const existingObj = await env.ASSETS.head(videoKey);
      if (existingObj && existingObj.size > 1000) {
        videoUrl = `${reqMock.url}/api/autoposter/assets/${encodeURIComponent(videoKey)}`;
      }
    }

    if (videoUrl) {
      plan.generatedVideoUrl = videoUrl;
      updatePlan(plan.id, { generatedVideoUrl: videoUrl });
      if (env.DB) {
        await updatePlanInD1(plan.id, { generatedVideoUrl: videoUrl }, env.DB);
      }
    }
  }

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
    freshnessScore: 0.95
  });
  plan.qualityScore = qualityResult.overallScore;

  plan.status = "READY";
  updatePlan(plan.id, { status: "READY", qualityScore: plan.qualityScore });
  if (env.DB) {
    await updatePlanInD1(plan.id, { status: "READY", qualityScore: plan.qualityScore }, env.DB);
  }

  const shouldPublishImmediately =
    options.publishNow || new Date(plan.scheduledFor).getTime() <= Date.now() + 60_000;

  if (shouldPublishImmediately) {
    if (!videoUrl) {
      throw new Error("Reel MP4 video has not been rendered yet. Render the Reel in Reel Studio before publishing.");
    }
    return await publishReelToFacebook(plan, job, env, videoUrl);
  } else {
    const pageConfig = getPageConfig(plan.brand, env);
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

    if (env.ASSETS && videoUrl) {
      try {
        const scheduleRecord = {
          id: plan.id,
          contentPlanId: plan.id,
          pageName: pageConfig.name,
          pageId: pageConfig.id,
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
          httpMetadata: { contentType: "application/json", cacheControl: "no-store" }
        });
      } catch (schedErr) {
        console.warn("Scheduler Reel save warning:", schedErr);
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
 * Handles Facebook publishing for Post format with strict image validation & synced D1/History/R2
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

  if (env.DB) {
    const freshPlan = await getPlanFromD1(plan.id, env.DB);
    if (freshPlan?.facebookPostId || freshPlan?.status === "PUBLISHED") {
      return {
        ok: true,
        planId: plan.id,
        brand: plan.brand,
        format: "POST",
        stage: "ALREADY_PUBLISHED",
        status: "PUBLISHED",
        facebookPostId: freshPlan.facebookPostId,
        publishedAt: freshPlan.publishedAt,
        message: `Skipping publish: Post already published in D1 with ID ${freshPlan.facebookPostId}.`
      };
    }
  }

  await transitionJobState(
    job.id,
    "PUBLISHING",
    "PUBLISHING_TO_FACEBOOK",
    `Publishing to Facebook Page (${plan.brand})`,
    { caption, assetUrl: imageUrl },
    env.DB
  );

  if (isInvalidOrPlaceholderMediaUrl(imageUrl)) {
    throw new Error("Post has no valid hosted R2 image URL to publish.");
  }

  let fbPostId = "";
  let resolvedPageId = "";
  const now = new Date().toISOString();

  try {
    const pageConfig = getPageConfig(plan.brand, env);
    resolvedPageId = pageConfig.id;
    const pageToken = getPageToken(plan.brand, env);

    const fbRes = await postImageToFacebook(caption, imageUrl!, pageConfig.id, pageToken, env, request);
    fbPostId = String(fbRes.id || fbRes.post_id || "");
    if (!fbPostId) {
      throw new Error("Facebook API succeeded without returning a post ID.");
    }
  } catch (fbErr: any) {
    const errorMsg = sanitizeHistoryError(fbErr instanceof Error ? fbErr.message : String(fbErr));
    try {
      await writeHistory(env, {
        id: plan.id,
        pageName: plan.brand as any,
        pageId: resolvedPageId || `page-${plan.brand.toLowerCase()}`,
        contentType: "image",
        caption,
        ...(imageUrl ? { imageUrl } : {}),
        status: "failed",
        createdAt: now,
        error: errorMsg
      });
    } catch (histErr) {
      console.warn("writeHistory failure notice:", histErr);
    }
    throw fbErr;
  }

  plan.facebookPostId = fbPostId;
  plan.publishedAt = now;
  plan.status = "PUBLISHED";
  updatePlan(plan.id, {
    facebookPostId: fbPostId,
    publishedAt: now,
    status: "PUBLISHED",
    retryCount: 0,
    nextRetryAt: undefined,
    errorMessage: undefined,
    processingStartedAt: undefined
  });
  if (env.DB) {
    await updatePlanInD1(
      plan.id,
      {
        facebookPostId: fbPostId,
        publishedAt: now,
        status: "PUBLISHED",
        retryCount: 0,
        nextRetryAt: undefined,
        errorMessage: undefined,
        processingStartedAt: undefined
      },
      env.DB
    );
  }

  await markContentMemoryPublished(plan.id, now, env.DB);

  await transitionJobState(
    job.id,
    "PUBLISHED",
    "PUBLISHED",
    `Successfully published to Facebook Page ${plan.brand} (Post ID: ${fbPostId})`,
    {
      facebookPostId: fbPostId,
      publishedAt: now,
      errorMessage: undefined,
      nextRetryAt: null
    },
    env.DB
  );

  // Sync any existing R2 schedule record if present
  if (env.ASSETS) {
    try {
      const existingSchedule = await env.ASSETS.get(`schedules/${plan.id}.json`);
      if (existingSchedule) {
        const rec = await existingSchedule.json();
        await env.ASSETS.put(
          `schedules/${plan.id}.json`,
          JSON.stringify({
            ...rec,
            status: "published",
            processingStartedAt: undefined,
            publishedAt: now,
            facebookPostId: fbPostId,
            error: undefined
          }),
          { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } }
        );
      }
    } catch (schedSyncErr) {
      console.warn("R2 schedule sync warning:", schedSyncErr);
    }
  }

  try {
    await writeHistory(env, {
      id: plan.id,
      pageName: plan.brand as any,
      pageId: resolvedPageId || `page-${plan.brand.toLowerCase()}`,
      contentType: "image",
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
 * Handles Facebook publishing for Reel format
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
    const errorMsg = sanitizeHistoryError(reelErr instanceof Error ? reelErr.message : String(reelErr));
    try {
      await writeHistory(env, {
        id: plan.id,
        pageName: plan.brand as any,
        pageId: `page-${plan.brand.toLowerCase()}`,
        contentType: "reel",
        caption,
        videoUrl,
        status: "failed",
        createdAt: now,
        error: errorMsg
      });
    } catch (histErr) {
      console.warn("writeHistory Reel failure notice:", histErr);
    }
    throw reelErr;
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

  await markContentMemoryPublished(plan.id, now, env.DB);

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
 * Finds all plans for target date (defaults to today IST) and runs POSTs
 * (Reels are left planned unless format filter or manual item execution is requested).
 */
export async function executeDailyQueue(
  dateStr: string,
  env: any,
  options: ExecutionOptions & { includeReels?: boolean } = {}
): Promise<{
  date: string;
  totalItems: number;
  successful: number;
  failed: number;
  skipped: number;
  results: ExecutionResult[];
}> {
  const targetDate = dateStr || getIstDateString();
  let plans = (env.DB ? await loadPlansFromD1(env.DB) : []).filter(
    (p: any) => p.scheduledFor && p.scheduledFor.startsWith(targetDate)
  );

  if (plans.length === 0) {
    const { listPlans } = await import("./autonomous-planner");
    plans = listPlans().filter((p) => p.scheduledFor && p.scheduledFor.startsWith(targetDate));
  }

  if (!options.includeReels) {
    plans = plans.filter((p: any) => p.format === "POST");
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
    date: targetDate,
    totalItems: plans.length,
    successful,
    failed,
    skipped,
    results
  };
}

/**
 * Cloudflare Cron Entrypoint for Content Intelligence (POSTs only; Reels untouched):
 * 1. Checks persistent automationEnabled flag
 * 2. Recovers stale GENERATING/PUBLISHING locks (> 10m)
 * 3. Ensures rolling IST strategy plans exist ahead of time (no early image gen)
 * 4. Claims & pre-generates fresh daily POSTs up to `preGenerateMinutes` (30m) before scheduled IST time
 * 5. Schedules into R2 `schedules/` (or publishes immediately if already at/within due window)
 */
export async function processContentEngineCron(
  env: any,
  now = new Date()
): Promise<{
  skipped?: boolean;
  reason?: string;
  recoveredLocks: number;
  plansCreated: number;
  processedPosts: number;
  publishedPosts: number;
  scheduledPosts: number;
  failedPosts: number;
}> {
  if (env.DB) {
    const { ensureContentEngineTables } = await import("./db");
    await ensureContentEngineTables(env.DB);
  }

  const settings = await loadEngineSettings(env);
  if (!settings.automationEnabled) {
    return {
      skipped: true,
      reason: "Autonomous engine is paused.",
      recoveredLocks: 0,
      plansCreated: 0,
      processedPosts: 0,
      publishedPosts: 0,
      scheduledPosts: 0,
      failedPosts: 0
    };
  }

  const nowIso = now.toISOString();
  const recoveredLocks = await recoverStaleGeneratingPlansD1(env.DB, 10);
  const rolling = await ensureRollingPlans(env, settings.autoPlanRollingDays);

  let processedPosts = 0;
  let publishedPosts = 0;
  let scheduledPosts = 0;
  let failedPosts = 0;
  let cronError = "";

  try {
    const allPlans = env.DB ? await loadPlansFromD1(env.DB) : [];
    const preGenMs = (settings.preGenerateMinutes || 30) * 60_000;
    const maxGracePastMs = 12 * 60 * 60_000; // Do not auto-fire posts older than 12 hours past schedule
    const nowMs = now.getTime();
    const publicOrigin = await resolvePublicOrigin(env);

    // Strictly POST items; REEL items remain untouched per user instruction
    const eligiblePosts = allPlans
      .filter((p: UnifiedContentPlan) => p.format === "POST")
      .filter((p: UnifiedContentPlan) => !(p as PostPlan).facebookPostId && p.status !== "PUBLISHED" && p.status !== "CANCELLED")
      .filter((p: UnifiedContentPlan) => p.status === "PLANNED" || p.status === "APPROVED" || p.status === "RETRYING" || p.status === "READY")
      .filter((p: UnifiedContentPlan) => {
        if (p.nextRetryAt && new Date(p.nextRetryAt).getTime() > nowMs) return false;
        const schedMs = new Date(p.scheduledFor).getTime();
        if (!Number.isFinite(schedMs)) return false;
        // Pre-generate within [scheduledFor - 30m .. scheduledFor + 12h]
        return schedMs - nowMs <= preGenMs && nowMs - schedMs <= maxGracePastMs;
      })
      .slice(0, 2); // Process up to 2 posts per cron minute to stay comfortably within Worker CPU/subrequest budgets

    for (const plan of eligiblePosts) {
      const claimed = await claimPlanForStageD1(
        plan.id,
        ["PLANNED", "APPROVED", "RETRYING", "READY"],
        "GENERATING",
        env.DB
      );
      if (!claimed) continue;

      processedPosts += 1;
      const res = await executePlanItem(plan.id, env, {
        publishNow: false, // Will publish now if <= 60s before scheduledFor, else schedules in R2 for exact time
        requestOrigin: publicOrigin
      });

      if (res.ok) {
        if (res.status === "PUBLISHED") publishedPosts += 1;
        else if (res.status === "SCHEDULED") scheduledPosts += 1;
      } else {
        failedPosts += 1;
        if (res.error) cronError = res.error;
      }
    }
  } catch (err: any) {
    cronError = sanitizeHistoryError(err instanceof Error ? err.message : String(err));
  }

  const summary = `IST ${getIstDateString(now)}: planned=${rolling.plansCreated}, processed=${processedPosts}, scheduled=${scheduledPosts}, published=${publishedPosts}, failed=${failedPosts}`;
  await saveEngineSettings(env, {
    lastCronRunAt: nowIso,
    lastCronSummary: summary,
    lastCronError: cronError || undefined
  });

  return {
    recoveredLocks,
    plansCreated: rolling.plansCreated,
    processedPosts,
    publishedPosts,
    scheduledPosts,
    failedPosts
  };
}
