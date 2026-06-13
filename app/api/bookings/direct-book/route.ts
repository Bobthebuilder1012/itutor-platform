import { NextRequest, NextResponse } from 'next/server';
import { LuniPayError } from 'lunipay';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { createSessionForBooking } from '@/lib/services/sessionService';
import { isPaidClassesEnabled } from '@/lib/featureFlags/paidClasses';
import { calculateCommissionForTutor } from '@/lib/utils/commissionCalculator';
import { getLunipayClient, ttdToCents } from '@/lib/payments/lunipayClient';
import { calculateGrossAmount } from '@/lib/payments/grossUp';
import { resolvePayer } from '@/lib/payments/resolvePayer';

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

    // 5b. Paid path: NO booking row is created here. We create a LuniPay
    // checkout session with the full booking intent in metadata; the
    // webhook materialises the booking only after payment succeeds.
    // This guarantees a tutor never sees a "ghost" CONFIRMED row for a
    // checkout the student abandoned.
    if (paidClassesEnabled && priceTtd > 0) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!appUrl) {
        console.error('[direct-book] NEXT_PUBLIC_APP_URL is not configured');
        return NextResponse.json(
          { error: 'Payments are not configured on this environment' },
          { status: 500 }
        );
      }

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
      const { grossAmount: grossPriceTtd, processingFee: sessionFee } = calculateGrossAmount(priceTtd);
      const amountCents = ttdToCents(grossPriceTtd);

      // Stripe-style metadata: ≤50 keys, ≤500 chars per value. Truncate
      // student_notes hard so a long note can't break session creation.
      const truncatedNotes = (studentNotes || '').slice(0, 400);

      try {
        const lunipay = getLunipayClient();
        const session = await lunipay.checkout.sessions.create(
          {
            amount: amountCents,
            currency: 'ttd',
            success_url: `${appUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appUrl}/student/tutors/${tutorId}?cancelled=1`,
            customer_email: customerEmail,
            line_items: [
              {
                name: description,
                quantity: 1,
                amount: amountCents,
              } as any,
            ],
            metadata: {
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
            },
          },
          // Idempotency: a genuine double-click (identical slot, duration AND
          // amount) returns the SAME hosted URL. amountCents is part of the key
          // so any change to time, duration, price, or processing fee starts a
          // FRESH session instead of colliding with a prior attempt — LuniPay
          // rejects a reused key whose request parameters changed (→ 502) and
          // would otherwise serve a stale session at the old amount.
          {
            idempotencyKey: `book-${user.id}-${tutorId}-${requestedStartAt}-${requestedEndAt}-${amountCents}`,
          }
        );

        return NextResponse.json({
          success: true,
          requires_payment: true,
          paymentUrl: session.url,
        });
      } catch (sdkError) {
        const isApiError = sdkError instanceof LuniPayError;
        console.error(
          '[direct-book] LuniPay sessions.create failed:',
          isApiError
            ? { code: sdkError.code, status: sdkError.status, message: sdkError.message }
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
