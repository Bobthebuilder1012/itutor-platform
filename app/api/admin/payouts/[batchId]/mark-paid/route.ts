// POST /api/admin/payouts/:batchId/mark-paid
//
// Wraps the released-state transition + tutor_balances decrement
// in a single Postgres transaction (mark_payout_batch_paid RPC,
// migration 147).
//
// Pre-flight: for subscription-batch rows that were force-flipped
// owed→release_ready without a proper balance transfer, available_ttd
// can be 0 while pending_ttd still holds the amount. We reconcile any
// shortfall (move pending→available) before calling the RPC so the
// CHECK constraint isn't violated.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  _request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  // ── Pre-flight: reconcile any available_ttd shortfall ─────────────────────
  // Load all ledger rows in this batch so we know how much each tutor is owed.
  const { data: ledgerRows } = await admin
    .from('payout_ledger')
    .select('tutor_id, amount_ttd')
    .eq('batch_id', params.batchId)
    .eq('status', 'release_ready');

  if (ledgerRows && ledgerRows.length > 0) {
    // Sum payout per tutor
    const neededByTutor = new Map<string, number>();
    for (const r of ledgerRows as any[]) {
      neededByTutor.set(
        r.tutor_id,
        (neededByTutor.get(r.tutor_id) ?? 0) + Number(r.amount_ttd)
      );
    }

    const tutorIds = Array.from(neededByTutor.keys());
    const { data: balances } = await admin
      .from('tutor_balances')
      .select('tutor_id, pending_ttd, available_ttd')
      .in('tutor_id', tutorIds);

    const balanceMap = new Map(
      (balances ?? []).map((b: any) => [b.tutor_id, b])
    );

    // For each tutor, if available_ttd < needed, pull the shortfall from pending_ttd
    const adjustments: Promise<any>[] = [];
    for (const [tutorId, needed] of neededByTutor) {
      const bal = balanceMap.get(tutorId);
      const available = Math.round((Number(bal?.available_ttd ?? 0)) * 100) / 100;
      const pending   = Math.round((Number(bal?.pending_ttd   ?? 0)) * 100) / 100;
      const shortfall = Math.round(Math.max(0, needed - available) * 100) / 100;

      if (shortfall > 0) {
        const newAvailable = Math.round((available + shortfall) * 100) / 100;
        const newPending   = Math.round(Math.max(0, pending - shortfall) * 100) / 100;
        adjustments.push(
          admin
            .from('tutor_balances')
            .upsert(
              { tutor_id: tutorId, available_ttd: newAvailable, pending_ttd: newPending, last_updated: new Date().toISOString() },
              { onConflict: 'tutor_id' }
            )
            .then(({ error }) => {
              if (error) console.error('[mark-paid] balance reconcile failed for', tutorId, error);
            })
        );
      }
    }

    if (adjustments.length > 0) {
      await Promise.all(adjustments);
    }
  }

  // ── Call the atomic RPC ───────────────────────────────────────────────────
  const { data, error } = await admin.rpc('mark_payout_batch_paid', {
    p_batch_id: params.batchId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, result: data });
}
