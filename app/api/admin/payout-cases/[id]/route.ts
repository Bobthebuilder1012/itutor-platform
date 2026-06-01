// GET /api/admin/payout-cases/:id — single case with full context

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  const { data: payoutCase, error } = await admin
    .from('payout_cases')
    .select(`
      id, hold_reason, status,
      refund_amount_ttd, release_amount_ttd,
      admin_notes, resolved_at, created_at, updated_at,
      payout_ledger_id, session_id, subscription_payment_id, payment_id,
      payout_ledger:payout_ledger(id, amount_ttd, status, blocked_at, hold_reason),
      tutor:profiles!tutor_id(id, full_name, email),
      claimant:profiles!claimant_id(id, full_name, email),
      admin_profile:profiles!admin_id(id, full_name),
      session:sessions!session_id(
        id, scheduled_start_at, scheduled_end_at, status, booking_id,
        charge_amount_ttd, payout_amount_ttd
      ),
      noshow_claim:noshow_claims!noshow_claim_id(
        id, status, admin_verdict, claimant_role,
        written_explanation, response_deadline, created_at
      ),
      subscription_payment:subscription_payments!subscription_payment_id(
        id, amount_ttd, status, type, period_start, period_end
      )
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (error) {
    console.error('[GET /api/admin/payout-cases/:id]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!payoutCase) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  return NextResponse.json({ case: payoutCase });
}
