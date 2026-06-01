// GET /api/admin/payments/stats — payment KPIs for the admin overview dashboard

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';

export async function GET() {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  // Run all queries in parallel
  const [
    paymentsRes,
    subPaymentsRes,
    balancesRes,
    heldLedgerRes,
    openCasesRes,
    releasedLedgerRes,
  ] = await Promise.all([
    // Session payments: total collected, total refunded, platform fee
    admin
      .from('payments')
      .select('amount_ttd, total_refunded_ttd, status')
      .in('status', ['succeeded', 'partially_refunded', 'refunded']),

    // Subscription payments: total collected
    admin
      .from('subscription_payments')
      .select('amount_ttd, platform_fee_ttd, tutor_payout_ttd, status')
      .in('status', ['PAID', 'REFUNDED']),

    // Tutor balances
    admin
      .from('tutor_balances')
      .select('pending_ttd, available_ttd'),

    // Held ledger rows
    admin
      .from('payout_ledger')
      .select('amount_ttd')
      .eq('status', 'admin_hold'),

    // Open payout cases
    admin
      .from('payout_cases')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'under_review']),

    // Released payouts (paid out total)
    admin
      .from('payout_ledger')
      .select('amount_ttd')
      .eq('status', 'released'),
  ]);

  const payments     = paymentsRes.data    ?? [];
  const subPayments  = subPaymentsRes.data ?? [];
  const balances     = balancesRes.data    ?? [];
  const heldRows     = heldLedgerRes.data  ?? [];
  const releasedRows = releasedLedgerRes.data ?? [];

  // ── Session payment stats ──
  const sessionTotalCollected = payments.reduce((s, p) => s + Number(p.amount_ttd ?? 0), 0);
  const sessionRefundedTotal  = payments.reduce((s, p) => s + Number(p.total_refunded_ttd ?? 0), 0);

  // ── Subscription payment stats ──
  const subTotalCollected = subPayments.reduce((s, p) => s + Number(p.amount_ttd ?? 0), 0);
  const subPlatformFees   = subPayments.reduce((s, p) => s + Number(p.platform_fee_ttd ?? 0), 0);

  // ── Combined ──
  const totalCollected  = +(sessionTotalCollected + subTotalCollected).toFixed(2);
  const totalRefunded   = +sessionRefundedTotal.toFixed(2);

  const pendingTtd   = balances.reduce((s, b) => s + Number(b.pending_ttd   ?? 0), 0);
  const availableTtd = balances.reduce((s, b) => s + Number(b.available_ttd ?? 0), 0);
  const heldTtd      = heldRows.reduce((s, r) => s + Number(r.amount_ttd    ?? 0), 0);
  const releasedTtd  = releasedRows.reduce((s, r) => s + Number(r.amount_ttd ?? 0), 0);

  // Platform fees = total collected – total paid out to tutors (released + pending + available + held)
  const tutorPayoutTotal = pendingTtd + availableTtd + heldTtd + releasedTtd;
  const platformFees     = +(totalCollected - totalRefunded - tutorPayoutTotal + subPlatformFees).toFixed(2);

  return NextResponse.json({
    total_collected_ttd:  totalCollected,
    total_refunded_ttd:   totalRefunded,
    pending_payout_ttd:   +pendingTtd.toFixed(2),
    available_payout_ttd: +availableTtd.toFixed(2),
    held_payout_ttd:      +heldTtd.toFixed(2),
    released_payout_ttd:  +releasedTtd.toFixed(2),
    platform_fees_ttd:    Math.max(0, platformFees),
    open_cases_count:     openCasesRes.count ?? 0,
  });
}
