/**
 * Credits, derived from the ledger.
 *
 * Rule 2 in practice. There is no balance column anywhere — every number here
 * is `sum(delta)` over `ai_credit_ledger`, which is append-only by trigger.
 * That is what makes a refund possible at all, and it is why a job that fails
 * can hand the credit back instead of the tutor simply losing it.
 *
 * The monthly grant is lazy rather than a scheduled job. A cron that grants
 * credit to every user on the first of the month does work proportional to the
 * whole user table for the benefit of the few who use the feature, and it has
 * to be exactly-once or it hands out free credit. Granting on first touch of
 * the month is self-healing: a user who never opens the hub is never granted,
 * and a user who opens it twice gets one grant because the second call sees the
 * first.
 */

import { getServiceClient } from '@/lib/supabase/server';

/** Matches the row seeded by migration 251 until paid tiers exist. */
const DEFAULT_TIER = 'FREE';

/** One generation costs one credit. */
export const CREDITS_PER_JOB = 1;

export interface Entitlement {
  monthlyCredits: number;
  rateLimitPerHour: number;
  maxPagesPerJob: number;
}

export async function getEntitlement(): Promise<Entitlement> {
  const { data } = await getServiceClient()
    .from('ai_entitlements')
    .select('monthly_credits, rate_limit_per_hour, max_pages_per_job')
    .eq('tier', DEFAULT_TIER)
    .eq('feature', 'ALL')
    .maybeSingle();

  return {
    monthlyCredits: data?.monthly_credits ?? 0,
    rateLimitPerHour: data?.rate_limit_per_hour ?? 0,
    maxPagesPerJob: data?.max_pages_per_job ?? 0,
  };
}

export async function getBalance(userId: string): Promise<number> {
  const { data, error } = await getServiceClient().rpc('ai_credit_balance', {
    p_user_id: userId,
  });

  if (error) throw new Error(`Could not read credit balance: ${error.message}`);
  return typeof data === 'number' ? data : 0;
}

/**
 * Grant this month's credits if they have not been granted yet.
 *
 * "This month" is the calendar month in UTC. A tutor in Trinidad crossing the
 * month boundary at 8pm local gets their grant a few hours early; that is a
 * better failure than the alternative of a timezone-aware window that can grant
 * twice at the seam.
 */
export async function ensureMonthlyGrant(userId: string): Promise<void> {
  const supabase = getServiceClient();

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const { data: existing } = await supabase
    .from('ai_credit_ledger')
    .select('id')
    .eq('user_id', userId)
    .eq('reason', 'MONTHLY_GRANT')
    .gte('created_at', monthStart)
    .limit(1)
    .maybeSingle();

  if (existing) return;

  const { monthlyCredits } = await getEntitlement();
  if (monthlyCredits <= 0) return;

  const { error } = await supabase.from('ai_credit_ledger').insert({
    user_id: userId,
    delta: monthlyCredits,
    reason: 'MONTHLY_GRANT',
    note: `Monthly allowance for ${monthStart.slice(0, 7)}`,
  });

  // A concurrent first-load can race this. Losing the race is fine — the other
  // request granted, and granting twice is the only outcome worth preventing.
  if (error) {
    console.error(`[ai-credits] monthly grant failed for ${userId}:`, error.message);
  }
}

/**
 * Charge one credit for a job.
 *
 * Returns false when the tutor cannot afford it, so the caller can refuse the
 * job rather than queueing work that would run for free. The partial unique
 * index from 251 means a second spend against the same job is rejected by the
 * database, so a retried enqueue cannot double-charge.
 */
export async function spendForJob(userId: string, jobId: string): Promise<boolean> {
  await ensureMonthlyGrant(userId);

  const balance = await getBalance(userId);
  if (balance < CREDITS_PER_JOB) return false;

  const { error } = await getServiceClient().from('ai_credit_ledger').insert({
    user_id: userId,
    delta: -CREDITS_PER_JOB,
    reason: 'JOB_SPEND',
    job_id: jobId,
  });

  // 23505 is the one-spend-per-job index: already charged, which is a success
  // from the caller's point of view.
  if (error && error.code !== '23505') {
    console.error(`[ai-credits] spend failed for job ${jobId}:`, error.message);
    return false;
  }

  return true;
}
