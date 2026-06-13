// POST /api/admin/payouts/run-weekly-move
//
// Manual, admin-gated equivalent of the Friday 4am cron
// (/api/cron/flip-payouts-release-ready). Use this when the scheduled
// run failed or needs to be re-run. Two steps, same order as the cron:
//
//   1. flip_owed_to_release_ready(grace)  — owed → release_ready,
//      tutor_balances pending → available.
//   2. move_release_ready_to_weekly_batch — isolate the release_ready
//      1:1 rows into a fresh 'pending_download' weekly batch.
//
// Safe to re-run: if the rows were already moved, step 2 finds nothing
// unbatched and creates no empty batch (RPC returns moved: 0).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_request: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  // Same grace window as the cron (default 0 = release everything completed).
  const graceRaw = process.env.PAYOUT_GRACE_HOURS;
  const graceHours = graceRaw ? parseInt(graceRaw, 10) : 0;
  if (!Number.isFinite(graceHours) || graceHours < 0) {
    return NextResponse.json(
      { error: `PAYOUT_GRACE_HOURS must be a non-negative integer (got: ${graceRaw})` },
      { status: 500 }
    );
  }

  // ── Step 1: flip owed → release_ready ──────────────────────────────────────
  const { data: flipData, error: flipError } = await admin.rpc('flip_owed_to_release_ready', {
    p_grace_hours: graceHours,
  });
  if (flipError) {
    console.error('[run-weekly-move] flip RPC failed:', flipError);
    return NextResponse.json({ error: 'Flip failed', details: flipError.message }, { status: 500 });
  }

  // ── Step 2: MOVE release_ready 1:1 rows into this week's batch ─────────────
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const { data: moveData, error: moveError } = await admin.rpc('move_release_ready_to_weekly_batch', {
    p_generated_by: auth.user!.id,
    p_batch_type:   'one_on_one',
    p_csv_filename: `itutor-payouts-week-${ts}.csv`,
    p_window_start: null,
    p_window_end:   null,
  });
  if (moveError) {
    console.error('[run-weekly-move] move RPC failed:', moveError);
    return NextResponse.json(
      { error: 'Flip succeeded but move failed', flip: flipData, details: moveError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, flip: flipData, move: moveData });
}
