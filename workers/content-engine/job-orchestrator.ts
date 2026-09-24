import type { ContentJob, JobStatus, UnifiedContentPlan } from "./types";
import type { D1DatabaseLike } from "./content-memory";

const IN_MEMORY_JOBS = new Map<string, ContentJob>();

function fromRow(row: any): ContentJob {
  return {
    id: row.id, planId: row.plan_id, brand: row.brand, format: row.format,
    state: row.state, retryCount: Number(row.retry_count || 0), maxRetries: Number(row.max_retries || 3),
    currentStep: row.current_step || "", assetUrl: row.asset_url || undefined,
    videoUrl: row.video_url || undefined, caption: row.caption || undefined,
    facebookPostId: row.facebook_post_id || undefined, publishedAt: row.published_at || undefined,
    errorMessage: row.error_message || undefined,
    logs: row.execution_logs ? JSON.parse(row.execution_logs) : [],
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export async function createContentJob(plan: UnifiedContentPlan, db?: D1DatabaseLike): Promise<ContentJob> {
  const durableJobId = `job-${plan.id}`;
  for (const existing of IN_MEMORY_JOBS.values()) if (existing.planId === plan.id) return existing;

  if (db) {
    try {
      const row = await db.prepare("SELECT * FROM content_jobs WHERE plan_id = ? LIMIT 1").bind(plan.id).first<any>();
      if (row) {
        const existing = fromRow(row);
        IN_MEMORY_JOBS.set(existing.id, existing);
        return existing;
      }
    } catch (err) {
      console.warn("D1 job lookup warning:", err);
    }
  }

  const now = new Date().toISOString();
  const job: ContentJob = {
    id: durableJobId, planId: plan.id, brand: plan.brand, format: plan.format,
    state: "PLANNED", retryCount: 0, maxRetries: 3, currentStep: "INITIALIZED",
    logs: [{ timestamp: now, step: "INITIALIZED", message: `Plan created for ${plan.brand} (${plan.format}): '${plan.topic}'` }],
    createdAt: now, updatedAt: now
  };
  IN_MEMORY_JOBS.set(job.id, job);

  if (db) {
    await db.prepare(`INSERT OR IGNORE INTO content_jobs
      (id, plan_id, brand, format, state, retry_count, max_retries, current_step, execution_logs, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(job.id, job.planId, job.brand, job.format, job.state, job.retryCount, job.maxRetries, job.currentStep, JSON.stringify(job.logs), job.createdAt, job.updatedAt).run();
  }
  return job;
}

export async function transitionJobState(
  jobId: string, newState: JobStatus, step: string, message: string,
  extraData: Partial<ContentJob> = {}, db?: D1DatabaseLike
): Promise<ContentJob> {
  let job = IN_MEMORY_JOBS.get(jobId);
  if (!job && db) {
    const row = await db.prepare("SELECT * FROM content_jobs WHERE id = ?").bind(jobId).first<any>();
    if (row) { job = fromRow(row); IN_MEMORY_JOBS.set(job.id, job); }
  }
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const now = new Date().toISOString();
  job = { ...job, ...extraData, state: newState, currentStep: step, updatedAt: now,
    logs: [...job.logs, { timestamp: now, step, message }] };
  IN_MEMORY_JOBS.set(job.id, job);

  if (db) {
    await db.prepare(`UPDATE content_jobs SET state=?, current_step=?, retry_count=?, asset_url=?, video_url=?, caption=?,
      facebook_post_id=?, published_at=?, error_message=?, execution_logs=?, updated_at=? WHERE id=?`)
      .bind(job.state, job.currentStep, job.retryCount, job.assetUrl || null, job.videoUrl || null, job.caption || null,
        job.facebookPostId || null, job.publishedAt || null, job.errorMessage || null, JSON.stringify(job.logs), job.updatedAt, job.id).run();
  }
  return job;
}

export function getJob(jobId: string): ContentJob | undefined { return IN_MEMORY_JOBS.get(jobId); }

export function listJobs(brand?: string): ContentJob[] {
  const jobs = Array.from(IN_MEMORY_JOBS.values());
  return (brand && brand !== "All" ? jobs.filter(j => j.brand.toLowerCase() === brand.toLowerCase()) : jobs)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
