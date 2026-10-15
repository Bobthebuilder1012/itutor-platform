// GET /api/cron/verification-cleanup[?apply=1]
//
// The retention sweep as a cron endpoint. NOT in vercel.json: nothing schedules
// it. Protected by CRON_SECRET like the other cron routes. A dry run unless
// `apply=1`, so calling it by hand is safe. Does nothing when
// VERIFICATION_V2_ENABLED is off.

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
