// =====================================================
// CANCEL PAYOUT BATCH (ADMIN)
// =====================================================
// POST /api/admin/payouts/:batchId/cancel
//
// Releases the ledger items back to release_ready (clears their
// batch_id) and marks the batch cancelled. Use when the CSV was
// generated but never sent, or the bank rejected the file.
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

  const { data: batch, error: fetchError } = await admin
    .from('payout_batches')
    .select('id, status')
    .eq('id', params.batchId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }
  if (batch.status !== 'exported') {
    return NextResponse.json(
      { error: `Batch is ${batch.status}, only exported batches can be cancelled` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { error: ledgerError } = await admin
    .from('payout_ledger')
    .update({ batch_id: null, updated_at: now })
    .eq('batch_id', params.batchId);

  if (ledgerError) {
    return NextResponse.json({ error: ledgerError.message }, { status: 500 });
  }

  const { error: deductionError } = await (admin as any)
    .from('tutor_deductions')
    .update({ deducted_from_batch_id: null })
    .eq('deducted_from_batch_id', params.batchId)
    .eq('status', 'pending');

  if (deductionError) {
    return NextResponse.json({ error: deductionError.message }, { status: 500 });
  }

  const { error: batchError } = await admin
    .from('payout_batches')
    .update({ status: 'cancelled', cancelled_at: now })
    .eq('id', params.batchId);

  if (batchError) {
    return NextResponse.json({ error: batchError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
