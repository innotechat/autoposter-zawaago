import type {
  ContentJob,
  JobStatus,
  UnifiedContentPlan
} from "./types";
import type { D1DatabaseLike } from "./content-memory";

const IN_MEMORY_JOBS = new Map<string, ContentJob>();

function mapD1RowToJob(row: any): ContentJob {
  let logs: { timestamp: string; step: string; message: string }[] = [];
  try {
    logs = JSON.parse((row.execution_logs as string) || "[]");
  } catch {
    logs = [];
  }
  return {
    id: String(row.id),
    planId: String(row.plan_id),
    brand: String(row.brand),
    format: row.format as any,
    state: row.state as JobStatus,
    retryCount: Number(row.retry_count || 0),
    maxRetries: Number(row.max_retries || 3),
    currentStep: String(row.current_step || ""),
    assetUrl: row.asset_url || undefined,
    videoUrl: row.video_url || undefined,
    caption: row.caption || undefined,
    facebookPostId: row.facebook_post_id || undefined,
    publishedAt: row.published_at || undefined,
    errorMessage: row.error_message || undefined,
    logs,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString())
  };
}

export async function createContentJob(
  plan: UnifiedContentPlan,
  db?: D1DatabaseLike
): Promise<ContentJob> {
  for (const existing of IN_MEMORY_JOBS.values()) {
    if (existing.planId === plan.id) {
      return existing;
    }
  }

  if (db) {
    try {
      const existingRow = await db
        .prepare(`SELECT * FROM content_jobs WHERE plan_id = ? ORDER BY updated_at DESC LIMIT 1`)
        .bind(plan.id)
        .first<any>();
      if (existingRow?.id) {
        const hydrated = mapD1RowToJob(existingRow);
        IN_MEMORY_JOBS.set(hydrated.id, hydrated);
        return hydrated;
      }
    } catch (err) {
      console.warn("D1 createContentJob lookup warning:", err);
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

export async function getOrCreateJobForPlan(
  plan: UnifiedContentPlan,
  db?: D1DatabaseLike
): Promise<ContentJob> {
  return createContentJob(plan, db);
}

export async function transitionJobState(
  jobId: string,
  newState: JobStatus,
  step: string,
  message: string,
  extraData?: Partial<ContentJob> & { nextRetryAt?: string | null },
  db?: D1DatabaseLike
): Promise<ContentJob> {
  let job = IN_MEMORY_JOBS.get(jobId);

  if (!job && db) {
    try {
      const row = await db
        .prepare(`SELECT * FROM content_jobs WHERE id = ? OR plan_id = ? ORDER BY updated_at DESC LIMIT 1`)
        .bind(jobId, jobId.startsWith("job-") ? jobId.slice(4) : jobId)
        .first<any>();
      if (row?.id) {
        job = mapD1RowToJob(row);
        IN_MEMORY_JOBS.set(job.id, job);
      }
    } catch (err) {
      console.warn("D1 transitionJobState lookup warning:", err);
    }
  }

  if (!job) {
    const nowInit = new Date().toISOString();
    job = {
      id: jobId,
      planId: extraData?.planId || (jobId.startsWith("job-") ? jobId.slice(4) : jobId),
      brand: extraData?.brand || "Zawaago",
      format: extraData?.format || "POST",
      state: newState,
      retryCount: extraData?.retryCount ?? 0,
      maxRetries: extraData?.maxRetries ?? 3,
      currentStep: step,
      logs: [],
      createdAt: nowInit,
      updatedAt: nowInit
    };

    if (db) {
      try {
        await db
          .prepare(
            `INSERT OR IGNORE INTO content_jobs (id, plan_id, brand, format, state, retry_count, max_retries, current_step, execution_logs, created_at, updated_at)
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
            JSON.stringify([]),
            job.createdAt,
            job.updatedAt
          )
          .run();
      } catch (err) {
        console.warn("D1 transitionJobState bootstrap insert warning:", err);
      }
    }
  }

  const now = new Date().toISOString();
  const trimmedLogs = [...job.logs, { timestamp: now, step, message }].slice(-40);

  job = {
    ...job,
    ...extraData,
    state: newState,
    currentStep: step,
    updatedAt: now,
    logs: trimmedLogs
  };

  IN_MEMORY_JOBS.set(job.id, job);

  if (db) {
    try {
      await db
        .prepare(
          `UPDATE content_jobs
           SET state = ?,
               current_step = ?,
               retry_count = ?,
               asset_url = ?,
               video_url = ?,
               caption = ?,
               facebook_post_id = ?,
               published_at = ?,
               error_message = ?,
               next_retry_at = ?,
               execution_logs = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .bind(
          job.state,
          job.currentStep,
          job.retryCount,
          job.assetUrl || null,
          job.videoUrl || null,
          job.caption || null,
          job.facebookPostId || null,
          job.publishedAt || null,
          job.errorMessage || null,
          extraData?.nextRetryAt ?? null,
          JSON.stringify(job.logs),
          job.updatedAt,
          job.id
        )
        .run();
    } catch (err) {
      console.warn("D1 transitionJobState update warning:", err);
    }
  }

  return job;
}

export async function markJobByPlanId(
  planId: string,
  newState: JobStatus,
  step: string,
  message: string,
  extraData?: Partial<ContentJob> & { nextRetryAt?: string | null },
  db?: D1DatabaseLike
): Promise<void> {
  for (const existing of IN_MEMORY_JOBS.values()) {
    if (existing.planId === planId) {
      await transitionJobState(existing.id, newState, step, message, extraData, db);
      return;
    }
  }

  if (db) {
    try {
      const row = await db
        .prepare(`SELECT * FROM content_jobs WHERE plan_id = ? ORDER BY updated_at DESC LIMIT 1`)
        .bind(planId)
        .first<any>();
      if (row?.id) {
        const hydrated = mapD1RowToJob(row);
        IN_MEMORY_JOBS.set(hydrated.id, hydrated);
        await transitionJobState(hydrated.id, newState, step, message, extraData, db);
        return;
      }
    } catch (err) {
      console.warn("D1 markJobByPlanId lookup warning:", err);
    }
  }
}

export function getJob(jobId: string): ContentJob | undefined {
  return IN_MEMORY_JOBS.get(jobId);
}

export function getJobByPlanId(planId: string): ContentJob | undefined {
  for (const job of IN_MEMORY_JOBS.values()) {
    if (job.planId === planId) return job;
  }
  return undefined;
}

export function listJobs(brand?: string): ContentJob[] {
  const jobs = Array.from(IN_MEMORY_JOBS.values());
  if (brand && brand !== "All") {
    return jobs.filter((j) => j.brand.toLowerCase() === brand.toLowerCase());
  }
  return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
