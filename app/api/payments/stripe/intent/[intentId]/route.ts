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
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getStripeClient, centsToTtd } from '@/lib/payments/stripeClient';
import { calculateGrossAmountForProvider } from '@/lib/payments/grossUp';
import { firstUpcomingSession, computeReleaseDate, isShortClass } from '@/lib/payments/secureSpot';
import type { SessionPattern } from '@/lib/utils/scheduleFormat';

/**
 * Rebuilds the fee breakdown for an intent created earlier.
 *
 * Returns null if the current rate no longer reproduces the fee this
 * intent was actually created with — i.e. the schedule changed in
 * between. Showing a breakdown whose parts don't sum to what the card
 * is charged would be worse than showing none.
 */
function feeBreakdownFor(baseTtd: number, chargedFeeTtd: number) {
  if (!Number.isFinite(baseTtd) || baseTtd <= 0) return null;
  const { processingFee, breakdown } = calculateGrossAmountForProvider(
    baseTtd,
    'stripe'
  );
  if (Math.abs(processingFee - chargedFeeTtd) > 0.01) return null;
  return breakdown;
}

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

    // -----------------------------------------------------------------
    // Subscription invoices carry NO metadata.
    //
    // For a native Stripe Subscription, Stripe creates the invoice's
    // PaymentIntent itself and it inherits nothing from the Subscription —
    // verified against a live intent: metadata is literally {}. So a
    // subscription checkout can't be identified from Stripe at all; it has
    // to be resolved from our own record, which /subscribe writes when it
    // stores stripe_payment_intent_id on subscription_payments.
    //
    // This also covers renewals, whose intents we never created.
    // -----------------------------------------------------------------
    if (
      md.kind !== 'create_booking' &&
      md.kind !== 'group_subscription' &&
      md.kind !== 'secure_spot'
    ) {
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      const { data: sp } = await admin
        .from('subscription_payments')
        .select('id, enrollment_id, group_id, student_id, payer_id, amount_ttd, charged_processing_fee_ttd')
        .eq('stripe_payment_intent_id', intentId)
        .maybeSingle();

      if (!sp) {
        return NextResponse.json({ error: 'Not a checkout payment' }, { status: 400 });
      }

      // Authorize against our own row, since there's no metadata to trust.
      //
      // EITHER PARTY may open this checkout: the student it enrols, or the payer
      // when that is someone else. The comment here already said "the payer may
      // be a parent" but the check only ever compared student_id — so a parent
      // paying for a child was sent to their own checkout page and shown
      // "Forbidden". There was no payer column to compare against until
      // migration 230; now there is.
      //
      // The 1:1 branch below has always allowed both. This is the same rule.
      if (sp.student_id !== user.id && sp.payer_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      if (intent.status === 'succeeded') {
        return NextResponse.json({ status: 'succeeded', alreadyPaid: true });
      }

      const { data: group } = await admin
        .from('groups')
        // cover_image / subject / form_level / description feed the class
        // profile block on the checkout. schedule_data and session_schedule are
        // deliberately NOT selected: they exist on production and not on
        // staging, and PostgREST rejects the whole select for one unknown
        // column — which would blank the checkout summary on staging. The
        // schedule line comes from /api/groups/schedules instead.
        .select('id, name, tutor_id, session_length_minutes, end_date, cover_image, subject, form_level, description, max_students')
        .eq('id', sp.group_id)
        .maybeSingle();

      const { data: groupTutor } = group?.tutor_id
        ? await admin
            .from('profiles')
            .select('id, full_name, display_name, avatar_url')
            .eq('id', group.tutor_id)
            .maybeSingle()
        : { data: null };

      // Only when the payer is someone else — a student paying for themself
      // does not need to be told whose class it is.
      let studentName: string | null = null;
      if (sp.payer_id && sp.payer_id !== sp.student_id) {
        const { data: st } = await admin
          .from('profiles')
          .select('full_name, display_name')
          .eq('id', sp.student_id)
          .maybeSingle();
        const s = st as { full_name: string | null; display_name: string | null } | null;
        studentName = s?.display_name || s?.full_name || null;
      }

      const base = Number(sp.amount_ttd ?? 0);
      const fee = Number(sp.charged_processing_fee_ttd ?? 0);

      return NextResponse.json({
        kind: 'group_subscription',
        status: intent.status,
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        amount: base,
        processingFee: fee,
        feeBreakdown: feeBreakdownFor(base, fee),
        total: centsToTtd(intent.amount),
        currency: 'TTD',
        durationMinutes: group?.session_length_minutes ?? null,
        startAt: null,
        endDate: (group as any)?.end_date ?? null,
        tutor: {
          id: group?.tutor_id ?? null,
          name: groupTutor?.display_name || groupTutor?.full_name || 'Your tutor',
          avatarUrl: groupTutor?.avatar_url ?? null,
        },
        subject: group?.name || 'Group class',
        groupId: sp.group_id,
        enrollmentId: sp.enrollment_id,
        // The class as an object, so checkout can show WHAT is being bought
        // rather than only what it costs.
        classProfile: {
          name: group?.name ?? 'Group class',
          coverImage: (group as any)?.cover_image ?? null,
          subject: (group as any)?.subject ?? null,
          formLevel: (group as any)?.form_level ?? null,
          description: (group as any)?.description ?? null,
          maxStudents: (group as any)?.max_students ?? null,
        },
        // Who the seat is for, when that is not the person paying. A parent
        // buying for two children needs the checkout to name which one — the
        // page otherwise says "your class" about someone else's.
        forStudent: studentName,
      });
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

    // -------- Group subscription --------
    // A monthly class subscription has no session slot and no subject row;
    // the "what am I buying" comes from the group itself.
    if (md.kind === 'group_subscription') {
      const { data: group } = await userClient
        .from('groups')
        .select('id, name, subject, tutor_id, session_length_minutes, end_date')
        .eq('id', md.group_id)
        .maybeSingle();

      const { data: groupTutor } = group?.tutor_id
        ? await userClient
            .from('profiles')
            .select('id, full_name, display_name, avatar_url')
            .eq('id', group.tutor_id)
            .maybeSingle()
        : { data: null };

      return NextResponse.json({
        kind: 'group_subscription',
        status: intent.status,
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        amount: Number(md.base_amount_ttd ?? '0'),
        processingFee: Number(md.processing_fee_ttd ?? '0'),
        feeBreakdown: feeBreakdownFor(Number(md.base_amount_ttd ?? '0'), Number(md.processing_fee_ttd ?? '0')),
        total: centsToTtd(intent.amount),
        currency: 'TTD',
        // Monthly plan — no single session start time to show.
        durationMinutes: group?.session_length_minutes ?? null,
        startAt: null,
        endDate: (group as any)?.end_date ?? null,
        tutor: {
          id: group?.tutor_id ?? null,
          name:
            groupTutor?.display_name || groupTutor?.full_name || 'Your tutor',
          avatarUrl: groupTutor?.avatar_url ?? null,
        },
        subject: group?.name || 'Group class',
        groupId: md.group_id,
        enrollmentId: md.enrollment_id ?? null,
      });
    }

    // -------- Secure your spot --------
    // A one-time charge covering the first month of a class that hasn't
    // started. The student is being asked for a card weeks before any lesson,
    // so the checkout has to say exactly when the class starts and what the
    // money is for. Nothing renews.
    if (md.kind === 'secure_spot') {
      const { data: group } = await userClient
        .from('groups')
        .select('id, name, subject, tutor_id, session_length_minutes, end_date')
        .eq('id', md.group_id)
        .maybeSingle();

      const { data: groupTutor } = group?.tutor_id
        ? await userClient
            .from('profiles')
            .select('id, full_name, display_name, avatar_url')
            .eq('id', group.tutor_id)
            .maybeSingle()
        : { data: null };

      // Dates are recomputed for display only. The authoritative release_date
      // is written once by the webhook; showing a figure here that was stored
      // earlier would go stale if the tutor edited the schedule mid-checkout.
      const { data: sessions } = await userClient
        .from('group_sessions')
        .select('recurrence_type, recurrence_days, start_time, duration_minutes, starts_on, ends_on')
        .eq('group_id', md.group_id);

      const firstSession = firstUpcomingSession((sessions ?? []) as SessionPattern[]);
      const endDate = (group as any)?.end_date ?? null;
      const releaseDate = firstSession ? computeReleaseDate({ firstSession, endDate }) : null;

      const base = Number(md.base_amount_ttd ?? '0');
      const fee = Number(md.processing_fee_ttd ?? '0');

      return NextResponse.json({
        kind: 'secure_spot',
        status: intent.status,
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        amount: base,
        processingFee: fee,
        feeBreakdown: feeBreakdownFor(base, fee),
        total: centsToTtd(intent.amount),
        currency: 'TTD',
        durationMinutes: group?.session_length_minutes ?? null,
        // The class start, not a session slot — this is what the student is
        // really buying, so the checkout leads with it.
        startAt: firstSession ? firstSession.toISOString() : null,
        endDate,
        releaseDate,
        shortClass: firstSession ? isShortClass({ firstSession, endDate }) : false,
        tutor: {
          id: group?.tutor_id ?? null,
          name: groupTutor?.display_name || groupTutor?.full_name || 'Your tutor',
          avatarUrl: groupTutor?.avatar_url ?? null,
        },
        subject: group?.name || 'Group class',
        groupId: md.group_id,
        enrollmentId: md.enrollment_id ?? null,
      });
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
      feeBreakdown: feeBreakdownFor(priceTtd, processingFee),
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
