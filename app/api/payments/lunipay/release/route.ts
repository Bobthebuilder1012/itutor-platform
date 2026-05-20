// =====================================================
// LUNIPAY ESCROW RELEASE
// =====================================================
// POST /api/payments/lunipay/release
// Headers: Authorization: Bearer <CRON_SECRET>
// Body: { session_id: string } OR { booking_id: string }
//
// Moves a tutor's payout from `pending` to `available` after a
// session is complete. Wraps the release_payout(p_session_id) SQL
// function (migration 021, atomized in 136) which now updates
// payout_ledger, sessions.payment_status, AND tutor_balances in a
// single transaction. This route only handles auth + payments.
// released_at + notifications.
//
// This endpoint is system-only — student/tutor UIs should not
// call it directly. A cron / session-completion hook calls it.
// Provider-agnostic: works for any paid `payments` row.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ReleaseBody = {
  session_id?: string;
  booking_id?: string;
};

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ReleaseBody;
  try {
    body = (await request.json()) as ReleaseBody;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  if (!body.session_id && !body.booking_id) {
    return NextResponse.json(
      { error: 'session_id or booking_id is required' },
      { status: 400 }
    );
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // -----------------------------------------------------------
  // Resolve session_id (canonical key for payout_ledger).
  // -----------------------------------------------------------
  let sessionId = body.session_id;
  let bookingId = body.booking_id;

  if (!sessionId && bookingId) {
    const { data: session, error } = await admin
      .from('sessions')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle();
    if (error || !session) {
      return NextResponse.json(
        { error: 'No session found for that booking' },
        { status: 404 }
      );
    }
    sessionId = session.id as string;
  }

  if (!sessionId) {
    return NextResponse.json(
      { error: 'Could not resolve session_id' },
      { status: 400 }
    );
  }

  const { data: session, error: sessionError } = await admin
    .from('sessions')
    .select('id, booking_id, tutor_id, payout_amount_ttd')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404 }
    );
  }

  if (!bookingId) bookingId = session.booking_id as string;

  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .select('id, status, released_at')
    .eq('booking_id', bookingId)
    .eq('status', 'succeeded')
    .maybeSingle();

  if (paymentError) {
    console.error('[lunipay/release] Lookup error:', paymentError);
    return NextResponse.json(
      { error: 'Failed to look up payment' },
      { status: 500 }
    );
  }

  if (!payment) {
    return NextResponse.json(
      { error: 'No succeeded payment found for this booking' },
      { status: 404 }
    );
  }

  if (payment.released_at) {
    return NextResponse.json({
      payment_id: payment.id,
      session_id: sessionId,
      status: 'already_released',
    });
  }

  const payoutAmount = Number(session.payout_amount_ttd ?? 0);
  if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
    return NextResponse.json(
      { error: 'Session has no positive payout amount' },
      { status: 400 }
    );
  }

  // release_payout RPC (migration 136) atomically updates
  // payout_ledger, sessions.payment_status, AND tutor_balances.
  // No follow-up balance write is needed here.
  const { error: rpcError } = await admin.rpc('release_payout', {
    p_session_id: sessionId,
  });

  if (rpcError) {
    console.error('[lunipay/release] release_payout RPC failed:', rpcError);
    return NextResponse.json(
      { error: 'Failed to release payout', details: rpcError.message },
      { status: 500 }
    );
  }

  await admin
    .from('payments')
    .update({ released_at: new Date().toISOString() })
    .eq('id', payment.id);

  await admin.from('notifications').insert({
    user_id: session.tutor_id,
    type: 'funds_released',
    title: 'Funds released',
    message: `$${payoutAmount.toFixed(2)} TTD has been released to your available balance.`,
    link: `/tutor/wallet`,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    payment_id: payment.id,
    session_id: sessionId,
    booking_id: bookingId,
    tutor_payout_ttd: payoutAmount,
    status: 'released',
  });
}
