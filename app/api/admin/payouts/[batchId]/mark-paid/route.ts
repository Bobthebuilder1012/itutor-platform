// =====================================================
// MARK PAYOUT BATCH AS PAID (ADMIN)
// =====================================================
// POST /api/admin/payouts/:batchId/mark-paid
//
// Wraps the released-state transition + tutor_balances decrement
// in a single Postgres transaction (mark_payout_batch_paid RPC,
// see migration 147) so a partial failure can't desync the
// ledger from balances.
// =====================================================

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
  const { data, error } = await admin.rpc('mark_payout_batch_paid', {
    p_batch_id: params.batchId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, result: data });
}
