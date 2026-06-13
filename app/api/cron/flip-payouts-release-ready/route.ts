// =====================================================
// CRON: WEEKLY PAYOUT MOVE (FLIP → ISOLATE)
// =====================================================
// GET /api/cron/flip-payouts-release-ready
// Headers: Authorization: Bearer <CRON_SECRET>
//
// Runs Fridays 04:00 (see vercel.json). Two steps, in order:
//
//   1. flip_owed_to_release_ready(p_grace_hours)
//        owed → release_ready; tutor_balances pending → available.
//
//   2. move_release_ready_to_weekly_batch(...)  ← the MOVE, not a sweep
//        Stamps every release_ready, unbatched 1:1 ledger row into a
//        fresh payout_batches row in status 'pending_download'. Those
//        rows leave the live "Ready for CSV" view and become "This
//        Week's Batch". The move does NOT change ledger status and
//        does NOT touch balances, so it cannot strand money.
//
// Nothing is finalised here: the batch only becomes payable after an
// admin downloads its CSV (retained server-side) and marks it paid.
//
// Grace window comes from PAYOUT_GRACE_HOURS env var (default 0 —
// release everything completed; see below).
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

  // ── Step 1: flip owed → release_ready ──────────────────────────────────────
  const { data: flipData, error: flipError } = await admin.rpc('flip_owed_to_release_ready', {
    p_grace_hours: graceHours,
  });

  if (flipError) {
    console.error('[cron/flip-payouts] flip RPC failed:', flipError);
    return NextResponse.json(
      { error: 'Failed to flip payouts', details: flipError.message },
      { status: 500 }
    );
  }

  // ── Step 2: MOVE release_ready 1:1 rows into this week's batch ──────────────
  // System actor for generated_by: the cron has no admin user, so we leave it
  // null (column is nullable / ON DELETE SET NULL).
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const { data: moveData, error: moveError } = await admin.rpc('move_release_ready_to_weekly_batch', {
    p_generated_by: null,
    p_batch_type:   'one_on_one',
    p_csv_filename: `itutor-payouts-week-${ts}.csv`,
    p_window_start: null,
    p_window_end:   null,
  });

  if (moveError) {
    // The flip already succeeded; surface the move failure but don't pretend
    // the whole run failed silently.
    console.error('[cron/flip-payouts] weekly move RPC failed:', moveError);
    return NextResponse.json(
      { error: 'Flip succeeded but weekly move failed', flip: flipData, details: moveError.message },
      { status: 500 }
    );
  }

  console.log('[cron/flip-payouts] flip=', flipData, 'move=', moveData);
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    grace_hours: graceHours,
    flip: flipData,
    move: moveData,
  });
}
