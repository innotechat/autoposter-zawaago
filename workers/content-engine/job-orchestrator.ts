import type {
  ContentJob,
  JobStatus,
  PostPlan,
  QualityCheckResult,
  ReelPlan,
  UnifiedContentPlan
} from "./types";
import type { D1DatabaseLike, R2BucketLike } from "./content-memory";
import { evaluateContentQuality } from "./quality-gate";
import { buildCaptionPrompt, buildImagePrompt } from "./prompt-engine";

const IN_MEMORY_JOBS = new Map<string, ContentJob>();

export async function createContentJob(
  plan: UnifiedContentPlan,
  db?: D1DatabaseLike
): Promise<ContentJob> {
  // Check if job already exists for this plan (Idempotency)
  for (const existing of IN_MEMORY_JOBS.values()) {
    if (existing.planId === plan.id) {
      return existing;
    }
  }

  const job: ContentJob = {
    id: `job-${crypto.randomUUID()}`,
    planId: plan.id,
    brand: plan.brand,
    format: plan.format,
    state: "PLANNED",
    retryCount: 0,
    maxRetries: 3,
    currentStep: "INITIALIZED",
    logs: [
      {
        timestamp: new Date().toISOString(),
        step: "INITIALIZED",
        message: `Plan created for ${plan.brand} (${plan.format}): '${plan.topic}'`
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  IN_MEMORY_JOBS.set(job.id, job);

  if (db) {
    try {
      await db
        .prepare(
          `INSERT INTO content_jobs (id, plan_id, brand, format, state, retry_count, max_retries, current_step, execution_logs, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          job.id,
          job.planId,
          job.brand,
          job.format,
          job.state,
          job.retryCount,
          job.maxRetries,
          job.currentStep,
          JSON.stringify(job.logs),
          job.createdAt,
          job.updatedAt
        )
        .run();
    } catch (err) {
      console.warn("D1 createContentJob error:", err);
    }
  }

  return job;
}

export async function transitionJobState(
  jobId: string,
  newState: JobStatus,
  step: string,
  message: string,
  extraData?: Partial<ContentJob>,
  db?: D1DatabaseLike
): Promise<ContentJob> {
  let job = IN_MEMORY_JOBS.get(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const now = new Date().toISOString();
  job = {
    ...job,
    ...extraData,
    state: newState,
    currentStep: step,
    updatedAt: now,
    logs: [...job.logs, { timestamp: now, step, message }]
  };

  IN_MEMORY_JOBS.set(job.id, job);

  if (db) {
    try {
      await db
        .prepare(
          `UPDATE content_jobs SET state = ?, current_step = ?, retry_count = ?, asset_url = ?, video_url = ?, caption = ?, error_message = ?, execution_logs = ?, updated_at = ? WHERE id = ?`
        )
        .bind(
          job.state,
          job.currentStep,
          job.retryCount,
          job.assetUrl || null,
          job.videoUrl || null,
          job.caption || null,
          job.errorMessage || null,
          JSON.stringify(job.logs),
          job.updatedAt,
          job.id
        )
        .run();
    } catch (err) {
      console.warn("D1 transitionJobState error:", err);
    }
  }

  return job;
}

export function getJob(jobId: string): ContentJob | undefined {
  return IN_MEMORY_JOBS.get(jobId);
}

export function listJobs(brand?: string): ContentJob[] {
  const jobs = Array.from(IN_MEMORY_JOBS.values());
  if (brand && brand !== "All") {
    return jobs.filter((j) => j.brand.toLowerCase() === brand.toLowerCase());
  }
  return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
