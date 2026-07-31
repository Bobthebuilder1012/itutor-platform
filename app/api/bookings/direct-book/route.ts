import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import Stripe from 'stripe';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { createSessionForBooking } from '@/lib/services/sessionService';
import { isPaidClassesEnabled } from '@/lib/featureFlags/paidClasses';
import { calculateCommissionForTutor } from '@/lib/utils/commissionCalculator';
import { getStripeClient, ttdToCents } from '@/lib/payments/stripeClient';
import { calculateGrossAmountForProvider } from '@/lib/payments/grossUp';
import { resolvePayer } from '@/lib/payments/resolvePayer';
import { findChildScheduleConflict, conflictMessage } from '@/lib/services/scheduleConflict';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = {
  tutorId: string;
  subjectId: string;
  requestedStartAt: string;
  requestedEndAt: string;
  studentNotes?: string;
  durationMinutes?: number;
};

const MIN_BOOKING_LEAD_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Body;
    const { tutorId, subjectId, requestedStartAt, requestedEndAt, studentNotes } = body;
    const durationMinutes = body.durationMinutes ?? 60;

    if (!tutorId || !subjectId || !requestedStartAt || !requestedEndAt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const requestedStartDate = new Date(requestedStartAt);
    const requestedEndDate = new Date(requestedEndAt);

    if (
      !Number.isFinite(requestedStartDate.getTime()) ||
      !Number.isFinite(requestedEndDate.getTime()) ||
      requestedEndDate <= requestedStartDate
    ) {
      return NextResponse.json({ error: 'Invalid booking time' }, { status: 400 });
    }

    if (requestedStartDate.getTime() < Date.now() + MIN_BOOKING_LEAD_MS) {
      return NextResponse.json(
        { error: 'Please select a time at least 15 minutes from now' },
        { status: 409 }
      );
    }

    const admin = getServiceClient();

    // Child-side schedule conflict: block if the student already has an
    // overlapping session/class on their own schedule.
    const conflict = await findChildScheduleConflict(admin, user.id, requestedStartAt, requestedEndAt);
    if (conflict) return NextResponse.json({ error: conflictMessage(conflict) }, { status: 409 });

    // 1. Check for duplicate (this student already booked this exact slot)
    const { data: existing } = await admin
      .from('bookings')
      .select('id, payment_required, payment_status, payer_id')
      .eq('student_id', user.id)
      .eq('tutor_id', tutorId)
      .eq('requested_start_at', requestedStartAt)
      .in('status', ['PENDING', 'CONFIRMED'])
      .maybeSingle();
    if (existing) {
      if (!existing.payer_id) {
        await admin.from('bookings').update({ payer_id: user.id }).eq('id', existing.id);
      }
      const needsPayment =
        existing.payment_required === true && existing.payment_status !== 'paid';
      return NextResponse.json({
        success: true,
        booking_id: existing.id,
        status: 'CONFIRMED',
        requires_payment: needsPayment,
      });
    }

    // 2. Check for conflicts — any CONFIRMED booking for this tutor overlapping the requested window
    // We check both confirmed_start_at (old flow) and requested_start_at (direct booking) to be safe
    const { data: conflicts } = await admin
      .from('bookings')
      .select('id')
      .eq('tutor_id', tutorId)
      .eq('status', 'CONFIRMED')
      .or(
        `and(confirmed_start_at.lt.${requestedEndAt},confirmed_end_at.gt.${requestedStartAt}),` +
        `and(requested_start_at.lt.${requestedEndAt},requested_end_at.gt.${requestedStartAt})`
      )
      .limit(1);
    if (conflicts && conflicts.length > 0) {
      return NextResponse.json({ error: 'This time slot is no longer available' }, { status: 409 });
    }

    // 3. Verify slot falls within tutor's availability rules
    // We query tutor_availability_rules directly because the is_time_slot_available RPC calls
    // get_tutor_public_calendar with the narrow booking window as the range, which filters out
    // rules whose window_start is before p_range_start — causing false negatives.
    {
      // Convert UTC to Trinidad time (UTC-4, no DST) for day-of-week and time comparisons
      const startDate = requestedStartDate;
      const endDate = requestedEndDate;
      const OFFSET_MS = 4 * 60 * 60 * 1000; // 4 hours in ms
      const startTrinidad = new Date(startDate.getTime() - OFFSET_MS);
      const endTrinidad = new Date(endDate.getTime() - OFFSET_MS);
      const dayOfWeek = startTrinidad.getUTCDay();
      const pad = (n: number) => String(n).padStart(2, '0');
      const startTimeStr = `${pad(startTrinidad.getUTCHours())}:${pad(startTrinidad.getUTCMinutes())}:00`;
      const endTimeStr = `${pad(endTrinidad.getUTCHours())}:${pad(endTrinidad.getUTCMinutes())}:00`;

      const { data: matchingRules } = await admin
        .from('tutor_availability_rules')
        .select('id')
        .eq('tutor_id', tutorId)
        .eq('is_active', true)
        .eq('day_of_week', dayOfWeek)
        .lte('start_time', startTimeStr)
        .gte('end_time', endTimeStr)
        .limit(1);

      if (!matchingRules || matchingRules.length === 0) {
        return NextResponse.json({ error: "This time is outside the tutor's availability" }, { status: 409 });
      }
    }

    // 3. Load student + tutor names for notification
    const [{ data: studentProfile }, { data: tutorSubject }] = await Promise.all([
      admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      admin.from('tutor_subjects').select('price_per_hour_ttd').eq('tutor_id', tutorId).eq('subject_id', subjectId).maybeSingle(),
    ]);

    // 4. Find matching session type (optional — null if not found)
    const { data: sessionTypes } = await admin
      .from('session_types')
      .select('id')
      .eq('tutor_id', tutorId)
      .eq('subject_id', subjectId)
      .eq('is_active', true)
      .limit(1);
    const sessionTypeId = sessionTypes?.[0]?.id ?? null;

    // 5. Compute pricing
    const paidClassesEnabled = isPaidClassesEnabled();
    const hourlyRate = tutorSubject?.price_per_hour_ttd ?? 0;

    if (paidClassesEnabled) {
      if (!hourlyRate || hourlyRate <= 0) {
        return NextResponse.json(
          { error: 'This tutor has not set a rate yet. Booking is not available until they do.' },
          { status: 400 }
        );
      }
      if (hourlyRate < 5) {
        return NextResponse.json(
          { error: "This tutor's rate is below the minimum of TT$5/hr. Please contact support." },
          { status: 400 }
        );
      }
    }

    const priceTtd = paidClassesEnabled ? Number(((hourlyRate / 60) * durationMinutes).toFixed(2)) : 0;
    const commission = paidClassesEnabled
      ? await calculateCommissionForTutor(admin, tutorId, priceTtd)
      : { platformFee: 0, payoutAmount: 0, commissionRate: 0 };

    // 5b. Paid path: NO booking row is created here. We create a Stripe
    // PaymentIntent with the full booking intent in metadata; the webhook
    // materialises the booking only after payment succeeds, via the
    // materialize_paid_booking_stripe RPC (migration 198).
    // This guarantees a tutor never sees a "ghost" CONFIRMED row for a
    // checkout the student abandoned.
    if (paidClassesEnabled && priceTtd > 0) {
      // NEXT_PUBLIC_APP_URL is no longer required here. The LuniPay flow
      // needed it to build success_url / cancel_url for the hosted page;
      // the Payment Element confirms inline, so there is nothing to
      // redirect to and no reason to fail the booking if it is unset.

      // Resolve who the cardholder is. For billing_mode='parent_required',
      // this is the linked parent, not the student.
      const payer = await resolvePayer(admin, user.id, user.email ?? null);
      const customerEmail = payer.email;
      if (!customerEmail) {
        return NextResponse.json(
          {
            error: payer.isProxy
              ? "The parent listed for this student doesn't have an email on file"
              : 'Your account is missing an email address',
          },
          { status: 400 }
        );
      }

      const subjectName = (tutorSubject as any)?.label || 'Tutoring Session';
      const description = `${subjectName} (${durationMinutes} min)`;
      const { grossAmount: grossPriceTtd, processingFee: sessionFee } =
        calculateGrossAmountForProvider(priceTtd, 'stripe');
      const amountCents = ttdToCents(grossPriceTtd);

      // Stripe metadata: ≤50 keys, ≤500 chars per value. Truncate
      // student_notes hard so a long note can't break intent creation.
      const truncatedNotes = (studentNotes || '').slice(0, 400);

      const intentMetadata = {
        kind: 'create_booking',
        student_id: user.id,
        payer_id: payer.payerId,
        tutor_id: tutorId,
        subject_id: subjectId,
        session_type_id: sessionTypeId ?? '',
        requested_start_at: requestedStartAt,
        requested_end_at: requestedEndAt,
        duration_minutes: String(durationMinutes),
        price_ttd: String(priceTtd),
        processing_fee_ttd: String(sessionFee),
        platform_fee_pct: String(Math.round(commission.commissionRate * 100)),
        platform_fee_ttd: String(commission.platformFee),
        tutor_payout_ttd: String(commission.payoutAmount),
        student_notes: truncatedNotes,
      };

      // Idempotency: a genuine double-click returns the SAME PaymentIntent.
      //
      // The key hashes EVERY request parameter, not just the slot and amount.
      // The previous key was
      //   book-<user>-<tutor>-<start>-<end>-<amountCents>
      // which omitted student_notes — so editing the note and retrying reused
      // the key with different parameters, which Stripe rejects outright
      // ("This idempotency key has already been used with different request
      // parameters"), poisoning that slot for the key's ~24h lifetime.
      // Hashing the full payload means any change starts a fresh intent while
      // a true duplicate submit still collapses onto one.
      const idempotencyKey = `book-${user.id}-${createHash('sha256')
        .update(JSON.stringify({ amountCents, description, customerEmail, ...intentMetadata }))
        .digest('hex')
        .slice(0, 40)}`;

      try {
        const stripe = getStripeClient();
        const intent = await stripe.paymentIntents.create(
          {
            amount: amountCents,
            currency: 'ttd',
            description,
            receipt_email: customerEmail,
            automatic_payment_methods: { enabled: true },
            metadata: intentMetadata,
          },
          { idempotencyKey }
        );

        // No booking row is created here — the Stripe webhook materialises
        // it on payment_intent.succeeded. Returning a clientSecret keeps the
        // student on-site: the modal mounts the Payment Element inline
        // instead of redirecting to a hosted checkout page.
        return NextResponse.json({
          success: true,
          requires_payment: true,
          clientSecret: intent.client_secret,
          paymentIntentId: intent.id,
          amount: priceTtd,
          processingFee: sessionFee,
          total: grossPriceTtd,
          currency: 'TTD',
        });
      } catch (sdkError) {
        const isApiError = sdkError instanceof Stripe.errors.StripeError;
        console.error(
          '[direct-book] Stripe paymentIntents.create failed:',
          isApiError
            ? { type: sdkError.type, code: sdkError.code, message: sdkError.message }
            : sdkError
        );
        return NextResponse.json(
          {
            error: 'Failed to start payment session',
            details: isApiError ? sdkError.message : (sdkError as Error).message,
          },
          { status: 502 }
        );
      }
    }

    // 6. Free path: insert booking directly as CONFIRMED, setting confirmed times so the calendar RPC sees it as busy.
    // Even free bookings record the canonical payer_id so future payments
    // can use the right cardholder.
    const freePayer = await resolvePayer(admin, user.id, user.email ?? null);
    const { data: booking, error: insertError } = await admin
      .from('bookings')
      .insert({
        student_id: user.id,
        tutor_id: tutorId,
        subject_id: subjectId,
        session_type_id: sessionTypeId,
        requested_start_at: requestedStartAt,
        requested_end_at: requestedEndAt,
        confirmed_start_at: requestedStartAt,
        confirmed_end_at: requestedEndAt,
        duration_minutes: durationMinutes,
        status: 'CONFIRMED',
        last_action_by: 'student',
        student_notes: studentNotes || null,
        price_ttd: priceTtd,
        payer_id: freePayer.payerId,
        payment_required: paidClassesEnabled,
        payment_status: 'unpaid',
        currency: 'TTD',
        platform_fee_pct: Math.round(commission.commissionRate * 100),
        platform_fee_ttd: commission.platformFee,
        tutor_payout_ttd: commission.payoutAmount,
      })
      .select('id')
      .single();

    if (insertError || !booking) {
      return NextResponse.json({ error: insertError?.message || 'Failed to create booking' }, { status: 500 });
    }

    // 7. Create the session (meeting link, etc.)
    let sessionCreationWarning: string | null = null;
    try {
      await createSessionForBooking(booking.id);
    } catch (err: any) {
      sessionCreationWarning = err?.message || 'Session creation failed';
      console.error('[direct-book] Session creation failed:', err);
    }

    // 8. Format time for notification
    const startDate = new Date(requestedStartAt);
    const formattedTime = startDate.toLocaleString('en-TT', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
    const studentName = studentProfile?.full_name || 'A student';

    // 9. Notify tutor (confirmed booking, not a request)
    await admin.from('notifications').insert({
      user_id: tutorId,
      type: 'booking_confirmed',
      title: 'Session Booked',
      message: `${studentName} booked a session with you for ${formattedTime}`,
      link: `/tutor/sessions`,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      booking_id: booking.id,
      status: 'CONFIRMED',
      requires_payment: paidClassesEnabled,
      sessionCreationWarning,
    });
  } catch (err: any) {
    console.error('[direct-book] Unexpected error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
