// GET /api/parent/approvals/[bookingId]/status — which checkout state to show.
//
// §9.1 names five: pre-redirect, success, cancelled, payment-failed, and
// seat-taken-during-checkout.
//
// WHY THIS READS THE BOOKING AND NOT JUST THE QUERY STRING
// Only two of the five are knowable from the redirect. Stripe sends the parent
// back to success_url or cancel_url, so `?checkout=success|cancelled` covers
// those — but payment-failed and seat-taken are decided AFTER the redirect, in
// the webhook. A parent bounced to success_url whose card then failed, or whose
// place was gone by the time fulfilment ran (§4.5), would be shown "paid" by a
// query-string-only implementation while the booking said otherwise.
//
// So the row is authoritative and the query string is only a hint about how the
// parent arrived. That also makes the states reachable later: a parent who closed
// the tab and comes back tomorrow still learns their money was refunded.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext, requireParentChild } from '@/lib/server/parentAccess';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ bookingId: string }> };

export type CheckoutState =
  | 'pre'
  | 'success'
  | 'cancelled'
  | 'failed'
  | 'seat_taken'
  | 'expired'
  | 'unknown';

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { bookingId } = await params;

    const hint = request.nextUrl.searchParams.get('hint');

    const { data: booking } = await admin
      .from('bookings')
      .select('id, student_id, status, payment_status, price_ttd, frozen_price, checkout_session_id')
      .eq('id', bookingId)
      .maybeSingle();

    const b = booking as unknown as {
      id: string;
      student_id: string;
      status: string;
      payment_status: string | null;
      price_ttd: number | null;
      frozen_price: number | null;
      checkout_session_id: string | null;
    } | null;

    if (!b) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await requireParentChild(parentProfile.id, b.student_id);

    const { data: child } = await admin
      .from('profiles')
      .select('full_name, display_name')
      .eq('id', b.student_id)
      .maybeSingle();

    const c = child as { full_name: string | null; display_name: string | null } | null;
    const childName = c?.display_name || c?.full_name || 'Your child';
    const amount = Number(b.frozen_price ?? b.price_ttd ?? 0);

    // The row decides. Order matters: the terminal outcomes are checked before
    // the redirect hint, because they are what actually happened.
    let state: CheckoutState;

    if (b.status === 'SEAT_UNAVAILABLE_REFUNDED') {
      state = 'seat_taken';
    } else if (b.status === 'CONFIRMED' || b.status === 'PARENT_APPROVED') {
      state = 'success';
    } else if (b.payment_status === 'failed') {
      state = 'failed';
    } else if (b.status === 'EXPIRED') {
      state = 'expired';
    } else if (b.status === 'PENDING_PARENT_APPROVAL') {
      // Still awaiting a decision. If they came back through cancel_url they
      // abandoned the page; otherwise they have not left yet.
      state = hint === 'cancelled' ? 'cancelled' : 'pre';
    } else {
      state = 'unknown';
    }

    return NextResponse.json({ state, childName, amount, bookingId: b.id });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/approvals/[bookingId]/status]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
