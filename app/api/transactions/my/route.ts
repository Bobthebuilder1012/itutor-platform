// GET /api/transactions/my
// Returns all PAID transactions for the authenticated student:
//   - subscription_payments (status='PAID')
//   - payments / bookings (status='succeeded')
// Sorted newest-first.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export type TransactionType = 'subscription' | 'lesson';

export interface Transaction {
  id: string;
  type: TransactionType;
  subtype: string | null;        // "Initial" | "Renewal" | "Reactivation" | null
  paid_at: string;
  amount_ttd: number;
  class_name: string | null;     // group name or subject name
  tutor_name: string | null;
  tutor_avatar: string | null;
  period_start: string | null;   // subscriptions only
  period_end: string | null;     // subscriptions only
  receipt_url: string | null;
  booking_start_at: string | null; // lessons only
}

function subtypeLabel(t: string): string {
  if (t === 'subscription_initial') return 'Initial';
  if (t === 'subscription_renewal') return 'Renewal';
  if (t === 'subscription_reactivation') return 'Reactivation';
  return t;
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();

    // ── Subscription payments ──────────────────────────────────────────────
    const { data: subPayments, error: spErr } = await admin
      .from('subscription_payments')
      .select(`
        id, type, amount_ttd, paid_at, period_start, period_end, receipt_url,
        group:groups!group_id (
          name,
          tutor:profiles!tutor_id ( full_name, avatar_url )
        )
      `)
      .eq('student_id', user.id)
      .eq('status', 'PAID')
      .not('paid_at', 'is', null)
      .order('paid_at', { ascending: false });

    if (spErr) throw spErr;

    const subscriptionTxns: Transaction[] = (subPayments ?? []).map((sp: any) => ({
      id: sp.id,
      type: 'subscription',
      subtype: subtypeLabel(sp.type),
      paid_at: sp.paid_at,
      amount_ttd: Number(sp.amount_ttd),
      class_name: sp.group?.name ?? null,
      tutor_name: sp.group?.tutor?.full_name ?? null,
      tutor_avatar: sp.group?.tutor?.avatar_url ?? null,
      period_start: sp.period_start ?? null,
      period_end: sp.period_end ?? null,
      receipt_url: sp.receipt_url ?? null,
      booking_start_at: null,
    }));

    // ── Booking / one-off lesson payments ──────────────────────────────────
    const { data: bookingPayments, error: bpErr } = await admin
      .from('payments')
      .select(`
        id, amount_ttd, created_at,
        booking:bookings!booking_id (
          confirmed_start_at, requested_start_at,
          tutor:profiles!tutor_id ( full_name, avatar_url ),
          subject:subjects!subject_id ( name )
        )
      `)
      .eq('payer_id', user.id)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false });

    if (bpErr) throw bpErr;

    const lessonTxns: Transaction[] = (bookingPayments ?? []).map((bp: any) => {
      const booking = bp.booking as any;
      const startAt = booking?.confirmed_start_at ?? booking?.requested_start_at ?? null;
      return {
        id: bp.id,
        type: 'lesson',
        subtype: null,
        paid_at: bp.created_at,
        amount_ttd: Number(bp.amount_ttd),
        class_name: booking?.subject?.name ?? null,
        tutor_name: booking?.tutor?.full_name ?? null,
        tutor_avatar: booking?.tutor?.avatar_url ?? null,
        period_start: null,
        period_end: null,
        receipt_url: null,
        booking_start_at: startAt,
      };
    });

    // ── Merge and sort newest-first ────────────────────────────────────────
    const all: Transaction[] = [...subscriptionTxns, ...lessonTxns].sort(
      (a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()
    );

    const total_ttd = all.reduce((s, t) => s + t.amount_ttd, 0);

    return NextResponse.json({ transactions: all, total_ttd });

  } catch (err) {
    console.error('[GET /api/transactions/my]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
