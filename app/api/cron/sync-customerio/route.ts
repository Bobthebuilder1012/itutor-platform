// =====================================================
// GET /api/cron/sync-customerio
// =====================================================
// Delivers profile changes to Customer.io.
//
// This exists instead of a sync call at each profile write site. The profiles
// table is written from roughly thirty places, and the failure mode of the
// per-site approach is invisible: someone adds a thirty-first writer, never
// knows this integration exists, and those users' attributes go stale with no
// error anywhere. The profiles_updated_at trigger already records that a row
// moved, so one reconciler reading that watermark covers every writer that
// exists today and every one added later.
//
// Idempotent and safe to over-run: the watermark plus attribute hash mean a
// second invocation in the same minute sends nothing.
//
// Headers: Authorization: Bearer <CRON_SECRET>

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { isCustomerIoEnabled } from '@/lib/customerio/config';
import { syncProfile, type SyncOutcome } from '@/lib/customerio/sync';

export const dynamic = 'force-dynamic';

/**
 * Profiles per invocation. The Track API allows 100 req/s, so this is nowhere
 * near the rate limit — the real constraint is the serverless execution
 * ceiling, since profiles are sent sequentially.
 */
const BATCH_SIZE = 200;

/** Stop and let the next run continue rather than being killed mid-batch. */
const TIME_BUDGET_MS = 45_000;

interface PendingRow {
  user_id: string;
  profile_updated_at: string;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Reported rather than silently returning zero, so a misconfigured
  // environment is distinguishable from a genuinely empty queue in the logs.
  if (!isCustomerIoEnabled()) {
    return NextResponse.json({ disabled: true, reason: 'CUSTOMERIO_ENABLED is not true' });
  }

  const startedAt = Date.now();
  const service = getServiceClient();

  const { data, error } = await service.rpc('customerio_pending_profiles', {
    p_limit: BATCH_SIZE,
  });

  if (error) {
    console.error('[customerio-sync] pending query failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pending = (data ?? []) as PendingRow[];
  if (pending.length === 0) {
    return NextResponse.json({ pending: 0, sent: 0 });
  }

  const counts: Record<SyncOutcome, number> = {
    sent: 0,
    unchanged: 0,
    disabled: 0,
    skipped: 0,
    not_found: 0,
    failed: 0,
  };

  let processed = 0;
  let ranOutOfTime = false;

  // Sequential on purpose. Concurrency here would buy little (the batch is
  // small) and costs the natural rate limiting that keeps a large backfill from
  // tripping Customer.io's throttle.
  for (const row of pending) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      ranOutOfTime = true;
      break;
    }

    const result = await syncProfile(row.user_id);
    counts[result.outcome] += 1;
    processed += 1;

    if (result.outcome === 'failed') {
      console.error(`[customerio-sync] ${row.user_id} failed:`, result.reason);
    }
  }

  return NextResponse.json({
    pending: pending.length,
    processed,
    ...counts,
    // True means there is more work than one run fits; the next scheduled run
    // picks it up, oldest-pending first.
    truncated: ranOutOfTime || pending.length === BATCH_SIZE,
    duration_ms: Date.now() - startedAt,
  });
}
