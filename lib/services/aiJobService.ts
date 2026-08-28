/**
 * The AI job worker.
 *
 * Rule 1 — no model call inside a request handler — only holds if there is
 * somewhere else for the work to happen. This is that somewhere. A route
 * enqueues a QUEUED `ai_jobs` row and returns immediately; this service, driven
 * by /api/cron/process-ai-jobs, claims it, runs it, and writes a terminal state.
 *
 * Rule 2 — no lifetime counter — is why `refundJob` exists and why it is called
 * on every terminal failure. A charge that cannot be reversed is a charge that
 * has to be conservative, and a conservative charge is one that stops tutors
 * using the feature.
 *
 * The handling that matters here is the boring kind: claim atomically so two
 * overlapping cron ticks cannot run the same job, distinguish transient from
 * permanent failure so the queue drains instead of burning credit on a
 * malformed prompt, and cap attempts so nothing retries forever.
 */

import { getServiceClient } from '@/lib/supabase/server';
import {
  estimateCostCents,
  isAiProviderConfigured,
  ProviderPermanentError,
  ProviderTransientError,
} from '@/lib/ai/provider';

/** Jobs claimed per tick. Small, because the cron runs every minute. */
const BATCH_SIZE = Number(process.env.AI_JOB_BATCH_SIZE ?? 5);

/**
 * After this many attempts a job is FAILED for good and refunded. Four is
 * enough to ride out a rate limit and few enough that a genuinely broken job
 * stops costing money quickly.
 */
const MAX_ATTEMPTS = Number(process.env.AI_JOB_MAX_ATTEMPTS ?? 4);

/**
 * A RUNNING job older than this was orphaned — the function that claimed it
 * timed out or the deployment cycled mid-run. Nothing else would ever move it,
 * so the sweep returns it to the queue.
 */
const STUCK_AFTER_MINUTES = Number(process.env.AI_JOB_STUCK_MINUTES ?? 15);

export type AiJobType =
  | 'LESSON_PLAN'
  | 'QUIZ_GENERATE'
  | 'STUDY_SHEET'
  | 'MARK_PAPER'
  | 'EXTRACT_TOPICS'
  | 'EXTRACT_SUBJECT_REPORT'
  | 'CHAT';

export interface AiJob {
  id: string;
  user_id: string;
  parent_run_id: string | null;
  job_type: AiJobType;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  input_ref: Record<string, unknown>;
  output_ref: Record<string, unknown> | null;
  attempts: number;
  error: string | null;
}

export interface ProcessSummary {
  claimed: number;
  succeeded: number;
  failed: number;
  retried: number;
  requeuedStuck: number;
  skipped?: string;
}

/**
 * A handler turns a job's input into its output. One per job_type.
 *
 * Handlers do not touch `ai_jobs`, the ledger, or retry policy — they take
 * input and return output, and everything around that is this file's problem.
 * That separation is what lets a new task flow be added without re-deriving
 * the failure handling.
 */
type JobHandler = (
  job: AiJob
) => Promise<{ output: Record<string, unknown>; model?: string; inputTokens?: number; outputTokens?: number }>;

/**
 * Handlers land here as the Phase 3 flows are built. The registry is empty on
 * purpose rather than stubbed with fakes: an unregistered type fails loudly and
 * refunds, which is the correct behaviour for work nobody has implemented yet.
 */
const HANDLERS: Partial<Record<AiJobType, JobHandler>> = {};

/**
 * Register a handler. Called from the flow modules as they are built, so this
 * service does not have to import every flow and drag their dependencies into
 * the worker's bundle.
 */
export function registerJobHandler(type: AiJobType, handler: JobHandler): void {
  HANDLERS[type] = handler;
}

// ── Credits ──────────────────────────────────────────────────────────────────

/**
 * Refund a job's spend.
 *
 * Deliberately quiet about the duplicate case: 251 puts a partial unique index
 * on (job_id) where reason = 'JOB_REFUND', so a second refund attempt for the
 * same job is rejected by the database rather than by this function
 * remembering. A retry loop that refunded on every failed attempt would hand
 * out free credit; here it simply cannot.
 */
async function refundJob(jobId: string, userId: string): Promise<void> {
  const supabase = getServiceClient();

  const { data: spend } = await supabase
    .from('ai_credit_ledger')
    .select('delta')
    .eq('job_id', jobId)
    .eq('reason', 'JOB_SPEND')
    .maybeSingle();

  // No spend recorded means nothing to give back — a job that failed before it
  // was ever charged.
  if (!spend || typeof spend.delta !== 'number') return;

  const { error } = await supabase.from('ai_credit_ledger').insert({
    user_id: userId,
    delta: Math.abs(spend.delta),
    reason: 'JOB_REFUND',
    job_id: jobId,
    note: 'Automatic refund on terminal job failure',
  });

  // 23505 is the unique violation from the one-refund-per-job index: the
  // refund already exists, which is the outcome we wanted anyway.
  if (error && error.code !== '23505') {
    console.error(`[ai-jobs] refund failed for job ${jobId}:`, error.message);
  }
}

// ── Terminal states ──────────────────────────────────────────────────────────

async function markSucceeded(
  job: AiJob,
  output: Record<string, unknown>,
  usage: { model?: string; inputTokens?: number; outputTokens?: number }
): Promise<void> {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;

  await getServiceClient()
    .from('ai_jobs')
    .update({
      status: 'SUCCEEDED',
      output_ref: output,
      model: usage.model ?? null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_cents: estimateCostCents(inputTokens, outputTokens),
      error: null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', job.id);
}

/**
 * Terminal failure: the job stops here and the credit goes back.
 */
async function markFailed(job: AiJob, message: string): Promise<void> {
  await getServiceClient()
    .from('ai_jobs')
    .update({
      status: 'FAILED',
      error: message.slice(0, 2000),
      completed_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  await refundJob(job.id, job.user_id);
}

/**
 * Non-terminal failure: back to QUEUED for another attempt.
 *
 * No refund here — the job has not finished failing yet. `attempts` was already
 * incremented at claim time, so the count is accurate even for a job whose
 * function died mid-run and got swept back by the stuck sweep.
 */
async function requeue(job: AiJob, message: string): Promise<void> {
  await getServiceClient()
    .from('ai_jobs')
    .update({
      status: 'QUEUED',
      claimed_at: null,
      error: message.slice(0, 2000),
    })
    .eq('id', job.id);
}

/**
 * Return orphaned RUNNING jobs to the queue.
 *
 * A serverless function that exceeds its limit leaves its job claimed forever.
 * Without this sweep those rows are invisible failures: the tutor sees a
 * spinner that never resolves and no error is ever recorded.
 */
async function requeueStuckJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60_000).toISOString();

  const { data, error } = await getServiceClient()
    .from('ai_jobs')
    .update({ status: 'QUEUED', claimed_at: null, error: 'Requeued after stalling in RUNNING' })
    .eq('status', 'RUNNING')
    .lt('claimed_at', cutoff)
    .select('id');

  if (error) {
    console.error('[ai-jobs] stuck sweep failed:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

// ── The tick ─────────────────────────────────────────────────────────────────

async function runOne(job: AiJob): Promise<'succeeded' | 'failed' | 'retried'> {
  const handler = HANDLERS[job.job_type];

  if (!handler) {
    // Not a crash — an honest terminal failure with the credit returned.
    await markFailed(job, `No handler registered for job type ${job.job_type}`);
    return 'failed';
  }

  try {
    const result = await handler(job);
    await markSucceeded(job, result.output, result);
    return 'succeeded';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    const retryable = error instanceof ProviderTransientError && job.attempts < MAX_ATTEMPTS;

    if (retryable) {
      await requeue(job, message);
      return 'retried';
    }

    // Permanent, or out of attempts. Either way this job is over.
    if (!(error instanceof ProviderPermanentError) && !(error instanceof ProviderTransientError)) {
      console.error(`[ai-jobs] unexpected error on job ${job.id}:`, error);
    }
    await markFailed(job, message);
    return 'failed';
  }
}

/**
 * One worker tick. Called by the cron route and by nothing else.
 */
export async function processAiJobs(): Promise<ProcessSummary> {
  const summary: ProcessSummary = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    retried: 0,
    requeuedStuck: 0,
  };

  // An environment with no key is an environment where this feature is off.
  // Returning early keeps the cron from filling the log with failures on every
  // deployment that is not the AI lab.
  if (!isAiProviderConfigured()) {
    return { ...summary, skipped: 'GEMINI_API_KEY not set in this environment' };
  }

  summary.requeuedStuck = await requeueStuckJobs();

  // Atomic claim. 251's ai_claim_next_jobs does the QUEUED -> RUNNING move in a
  // single statement with FOR UPDATE SKIP LOCKED, so two overlapping ticks
  // cannot pick up the same row.
  const { data: jobs, error } = await getServiceClient().rpc('ai_claim_next_jobs', {
    p_limit: BATCH_SIZE,
  });

  if (error) {
    throw new Error(`Failed to claim AI jobs: ${error.message}`);
  }

  const claimed = (jobs ?? []) as AiJob[];
  summary.claimed = claimed.length;

  // Sequential, not parallel. These are model calls against a shared rate
  // limit, and a batch that trips it just converts five jobs into five retries.
  for (const job of claimed) {
    const outcome = await runOne(job);
    if (outcome === 'succeeded') summary.succeeded += 1;
    else if (outcome === 'failed') summary.failed += 1;
    else summary.retried += 1;
  }

  return summary;
}
