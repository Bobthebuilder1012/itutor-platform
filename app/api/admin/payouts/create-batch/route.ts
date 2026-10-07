// POST /api/admin/payouts/create-batch
//
// Creates a payout batch from selected subscription_payment IDs (lesson
// payouts) or payout_ledger IDs (1:1 payouts). The work lives in
// lib/payouts/createPayoutBatch.ts, shared with the per-tutor Teacher
// Payouts flow (/api/admin/tutor-payouts/generate).
//
// Body: { subscription_payment_ids: string[] } | { payout_ledger_ids: string[] }

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { createPayoutBatch } from '@/lib/payouts/createPayoutBatch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (err: any) {
    console.error('[POST /api/admin/payouts/create-batch] unhandled error:', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}

async function handlePost(request: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));

  // Two modes:
  //   payout_ledger_ids   — direct ledger IDs (1:1 session payouts)
  //   subscription_payment_ids — look up ledger rows by subscription payment (subscriptions)
  const ledgerIds: string[] | null = Array.isArray(body?.payout_ledger_ids) && body.payout_ledger_ids.length > 0
    ? body.payout_ledger_ids
    : null;
  const spIds: string[] = Array.isArray(body?.subscription_payment_ids)
    ? body.subscription_payment_ids
    : [];

  if (!ledgerIds && spIds.length === 0) {
    return NextResponse.json(
      { error: 'Provide payout_ledger_ids (1:1 payouts) or subscription_payment_ids (subscription payouts)' },
      { status: 400 }
    );
  }
  if ((ledgerIds?.length ?? spIds.length) > 200) {
    return NextResponse.json({ error: 'Maximum 200 IDs per batch' }, { status: 400 });
  }

  const result = await createPayoutBatch(getServiceClient(), auth.user!.id, { ledgerIds, spIds });
  return NextResponse.json(result.body, { status: result.status });
}
