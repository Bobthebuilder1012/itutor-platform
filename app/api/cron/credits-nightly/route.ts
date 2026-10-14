// GET /api/cron/credits-nightly — the credit programme's daily job.
// Converts referrals a webhook missed, matures held rewards, expires old
// credits, issues rewards people now qualify for, and settles or releases
// stale checkout reservations. See lib/credits/nightly.ts. Protected by
// CRON_SECRET; idempotent, so a manual rerun is safe.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { runCreditsNightly } from '@/lib/credits/nightly';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runCreditsNightly(getServiceClient());
  if (result.errors.length > 0) {
    console.error('[cron/credits-nightly] finished with errors:', result.errors);
    // 500 so the failure shows up in the cron log instead of passing silently.
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
