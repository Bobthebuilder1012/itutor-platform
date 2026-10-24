// GET /api/cron/verification-cleanup[?apply=1]
//
// The retention sweep as a cron endpoint. Scheduled daily in vercel.json with
// ?apply=1. Protected by CRON_SECRET like the other cron routes. Called by hand
// without apply=1 it is a dry run, so that is safe. Does nothing at all (no sweep,
// no database client) when VERIFICATION_V2_ENABLED is off, so the schedule stays
// idle until the flag is turned on.

import { NextRequest, NextResponse } from 'next/server';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import { runVerificationCleanup } from '@/lib/verificationV2/cleanup';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isVerificationV2Enabled()) {
    return NextResponse.json({ skipped: 'VERIFICATION_V2_ENABLED is off' });
  }

  const apply = new URL(request.url).searchParams.get('apply') === '1';
  const report = await runVerificationCleanup({ dryRun: !apply });
  return NextResponse.json(report);
}
