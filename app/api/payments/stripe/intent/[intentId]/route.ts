// =====================================================
// PAY-FIRST INTENT SUMMARY
// =====================================================
// GET /api/payments/stripe/intent/[intentId]
//
// Resolves a `create_booking` PaymentIntent into everything the
// checkout page needs to render: the client secret plus the tutor,
// subject, slot and price breakdown.
//
// Exists because the pay-first flow has NO booking row to read from —
// /api/bookings/direct-book creates only a PaymentIntent, and the
// booking is materialised by the webhook after payment. The booking
// intent therefore lives in the PaymentIntent's metadata, and this is
// what turns it back into a renderable summary so checkout can be a
// real page instead of a modal step holding state in memory.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getStripeClient, centsToTtd } from '@/lib/payments/stripeClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ intentId: string }> }
) {
  try {
    const { intentId } = await params;

    if (!intentId.startsWith('pi_')) {
      return NextResponse.json({ error: 'Invalid intent id' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const userClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stripe = getStripeClient();
    let intent;
    try {
      intent = await stripe.paymentIntents.retrieve(intentId);
    } catch {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const md = intent.metadata || {};

    if (md.kind !== 'create_booking') {
      return NextResponse.json(
        { error: 'Not a booking payment' },
        { status: 400 }
      );
    }

    // Only the student the booking is for, or the payer footing the bill
    // (a parent under billing_mode='parent_required'), may load it.
    if (md.student_id !== user.id && md.payer_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Already paid — the webhook has (or is about to) create the booking.
    if (intent.status === 'succeeded') {
      return NextResponse.json({ status: 'succeeded', alreadyPaid: true });
    }
    if (intent.status === 'canceled') {
      return NextResponse.json(
        { error: 'This checkout has expired. Please book again.' },
        { status: 410 }
      );
    }

    const [{ data: tutor }, { data: subject }] = await Promise.all([
      userClient
        .from('profiles')
        .select('id, full_name, display_name, avatar_url, bio')
        .eq('id', md.tutor_id)
        .maybeSingle(),
      userClient
        .from('subjects')
        .select('name, label')
        .eq('id', md.subject_id)
        .maybeSingle(),
    ]);

    // Rating is deliberately NOT computed here. /api/public/tutors/[id]/reviews
    // already owns that aggregation (including the soft-delete rules from
    // migration 191); the checkout page fetches it directly, the same way the
    // tutor profile does, rather than duplicating the logic.

    const priceTtd = Number(md.price_ttd ?? '0');
    const processingFee = Number(md.processing_fee_ttd ?? '0');

    return NextResponse.json({
      status: intent.status,
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      amount: priceTtd,
      processingFee,
      total: centsToTtd(intent.amount),
      currency: 'TTD',
      durationMinutes: parseInt(md.duration_minutes ?? '60', 10),
      startAt: md.requested_start_at,
      endAt: md.requested_end_at,
      tutor: {
        id: md.tutor_id,
        name: tutor?.display_name || tutor?.full_name || 'Your tutor',
        avatarUrl: tutor?.avatar_url ?? null,
        bio: tutor?.bio ?? null,
      },
      subject: subject?.label || subject?.name || 'Tutoring session',
    });
  } catch (err) {
    console.error('[stripe/intent] Unhandled error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
