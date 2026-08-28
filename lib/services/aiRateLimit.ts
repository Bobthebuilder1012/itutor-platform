/**
 * The ceiling on unbilled model calls.
 *
 * Chat is metered but not charged a credit, which is the right call for launch —
 * a conversation costing a generation per reply makes tutors ration questions,
 * and a chat surface people ration is worse than no chat surface.
 *
 * But an unbilled surface with no ceiling is the one path in the product where
 * cost is not bounded by anything. A stuck client retry loop or a scripted
 * caller could run up a bill nobody notices, because there is no falling credit
 * balance to make it visible. This is that bound.
 *
 * It is deliberately not a rationing mechanism. `ai_entitlements.rate_limit_per_hour`
 * is seeded at 20/hour, which no tutor holding a conversation will reach and a
 * runaway loop will hit within seconds.
 */

import { getServiceClient } from '@/lib/supabase/server';
import { getEntitlement } from '@/lib/services/aiCreditService';
import type { AiJobType } from '@/lib/services/aiJobService';

export interface RateVerdict {
  allowed: boolean;
  /** Calls used in the trailing hour. */
  used: number;
  limit: number;
  /** Seconds until the oldest call in the window falls out of it. */
  retryAfterSeconds: number;
}

/**
 * Check the trailing-hour allowance for one job type.
 *
 * Counts rows rather than keeping a counter, so it is correct across instances
 * with no shared state and self-heals — there is no counter to drift or to
 * reset. At these volumes the indexed count is cheap.
 */
export async function checkHourlyLimit(
  userId: string,
  jobType: AiJobType
): Promise<RateVerdict> {
  const { rateLimitPerHour } = await getEntitlement();

  // A tier with no limit configured is unlimited by definition, not blocked.
  if (!rateLimitPerHour || rateLimitPerHour <= 0) {
    return { allowed: true, used: 0, limit: 0, retryAfterSeconds: 0 };
  }

  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const service = getServiceClient();

  const { data, error } = await service
    .from('ai_jobs')
    .select('created_at')
    .eq('user_id', userId)
    .eq('job_type', jobType)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: true });

  // Fail open. A bookkeeping query that cannot run is not a reason to refuse a
  // tutor their answer; the credit ledger still bounds everything that bills.
  if (error) {
    console.error('[ai-rate-limit] check failed, allowing:', error.message);
    return { allowed: true, used: 0, limit: rateLimitPerHour, retryAfterSeconds: 0 };
  }

  const used = data?.length ?? 0;
  if (used < rateLimitPerHour) {
    return { allowed: true, used, limit: rateLimitPerHour, retryAfterSeconds: 0 };
  }

  // Tell them when, not just no. The window frees up when its oldest entry
  // ages out.
  const oldest = data?.[0]?.created_at;
  const freesAt = oldest ? new Date(oldest).getTime() + 60 * 60 * 1000 : Date.now() + 60_000;
  const retryAfterSeconds = Math.max(1, Math.ceil((freesAt - Date.now()) / 1000));

  return { allowed: false, used, limit: rateLimitPerHour, retryAfterSeconds };
}
