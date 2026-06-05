// =====================================================
// CRON: FLIP OWED → RELEASE_READY
// =====================================================
// GET /api/cron/flip-payouts-release-ready
// Headers: Authorization: Bearer <CRON_SECRET>
//
// Runs daily (see vercel.json). Calls the SQL RPC
// flip_owed_to_release_ready(p_grace_hours), which:
//   - flips payout_ledger rows older than the grace window from
//     'owed' → 'release_ready'
//   - shifts each tutor's tutor_balances: pending → available
//
// Grace window comes from PAYOUT_GRACE_HOURS env var (default 168 =
// 7 days, matching LuniPay's settlement floor).
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const graceHoursRaw = process.env.PAYOUT_GRACE_HOURS;
  // Default 0 — release ALL completed sessions on Fridays (no grace window).
  // Set PAYOUT_GRACE_HOURS to override.
  const graceHours = graceHoursRaw ? parseInt(graceHoursRaw, 10) : 0;

  if (!Number.isFinite(graceHours) || graceHours < 0) {
    return NextResponse.json(
      { error: `PAYOUT_GRACE_HOURS must be a non-negative integer (got: ${graceHoursRaw})` },
      { status: 500 }
    );
  }

  const admin = getServiceClient();
  const { data, error } = await admin.rpc('flip_owed_to_release_ready', {
    p_grace_hours: graceHours,
  });

  if (error) {
    console.error('[cron/flip-payouts] RPC failed:', error);
    return NextResponse.json(
      { error: 'Failed to flip payouts', details: error.message },
      { status: 500 }
    );
  }

  console.log('[cron/flip-payouts]', data);
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    grace_hours: graceHours,
    result: data,
  });
}
