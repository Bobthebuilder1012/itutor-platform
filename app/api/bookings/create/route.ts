import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isPaidClassesEnabled } from '@/lib/featureFlags/paidClasses';
import { getServiceClient } from '@/lib/supabase/server';
import { calculateCommission } from '@/lib/utils/commissionCalculator';

type Body = {
  studentId?: string;
  tutorId: string;
  subjectId: string;
  sessionTypeId: string;
  requestedStartAt: string;
  requestedEndAt: string;
  studentNotes?: string;
  durationMinutes?: number;
  communityId?: string | null;
};

function getAuthedSupabase() {
  const cookieStore = cookies();
  return createServerClient(
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
}

export const dynamic = 'force-dynamic';

async function createParentBooking(
  userId: string,
  body: Body,
  durationMinutes: number,
  supabase: ReturnType<typeof getAuthedSupabase>
) {
  const admin = getServiceClient();
  const childId = body.studentId!;

  const [{ data: parentProfile }, { data: link }, { data: childProfile }] = await Promise.all([
    admin.from('profiles').select('id, role').eq('id', userId).maybeSingle(),
    admin
      .from('parent_child_links')
      .select('child_id')
      .eq('parent_id', userId)
      .eq('child_id', childId)
      .maybeSingle(),
    admin.from('profiles').select('id, full_name').eq('id', childId).maybeSingle(),
  ]);

  if (!parentProfile || parentProfile.role !== 'parent') {
    throw new Error('Only parents can create bookings for a child');
  }

  if (!link) {
    throw new Error('You can only create bookings for your linked children');
  }

  const { data: isSlotAvailable, error: availabilityError } = await supabase.rpc(
    'is_time_slot_available',
    {
      p_tutor_id: body.tutorId,
      p_requested_start: body.requestedStartAt,
      p_requested_end: body.requestedEndAt,
    }
  );

  if (availabilityError) {
    throw new Error(availabilityError.message);
  }

  if (!isSlotAvailable) {
    throw new Error('The requested time slot is no longer available');
  }

  const [{ data: sessionType }, { data: tutorSubject }, { data: existingBooking }, { data: tutorProfile }] =
    await Promise.all([
    admin
      .from('session_types')
      .select('id, tutor_id, subject_id, price_ttd, is_active')
      .eq('id', body.sessionTypeId)
      .eq('tutor_id', body.tutorId)
      .eq('subject_id', body.subjectId)
      .maybeSingle(),
    admin
      .from('tutor_subjects')
      .select('price_per_hour_ttd')
      .eq('tutor_id', body.tutorId)
      .eq('subject_id', body.subjectId)
      .maybeSingle(),
    admin
      .from('bookings')
      .select('id')
      .eq('student_id', childId)
      .eq('tutor_id', body.tutorId)
      .eq('requested_start_at', body.requestedStartAt)
      .in('status', ['PENDING', 'PARENT_APPROVED', 'CONFIRMED'])
      .maybeSingle(),
    admin
      .from('profiles')
      .select('allow_same_day_bookings')
      .eq('id', body.tutorId)
      .maybeSingle(),
  ]);

  if (!sessionType?.is_active) {
    throw new Error('Invalid session type');
  }

  if (existingBooking) {
    return {
      success: true,
      booking_id: existingBooking.id,
      status: 'PENDING',
      requires_payment: isPaidClassesEnabled(),
    };
  }

  const requestedStartAt = new Date(body.requestedStartAt);
  const hoursUntilSession = (requestedStartAt.getTime() - Date.now()) / (1000 * 60 * 60);

  if (requestedStartAt.getTime() <= Date.now()) {
    throw new Error('Cannot book sessions in the past');
  }

  if (!tutorProfile?.allow_same_day_bookings && hoursUntilSession < 24) {
    throw new Error('Bookings must be made at least 24 hours in advance');
  }

  const hourlyRate = tutorSubject?.price_per_hour_ttd ?? sessionType.price_ttd;
  if (!hourlyRate) {
    throw new Error('Tutor pricing is not configured for this subject');
  }

  const priceTtd = Number(((hourlyRate / 60) * durationMinutes).toFixed(2));
  const paidClassesEnabled = isPaidClassesEnabled();
  const commission = paidClassesEnabled
    ? calculateCommission(priceTtd)
    : { platformFee: 0, payoutAmount: 0, commissionRate: 0 };
  const initialStatus = paidClassesEnabled ? 'PARENT_APPROVED' : 'PENDING';

  const { data: booking, error: insertError } = await admin
    .from('bookings')
    .insert({
      student_id: childId,
      tutor_id: body.tutorId,
      subject_id: body.subjectId,
      session_type_id: body.sessionTypeId,
      requested_start_at: body.requestedStartAt,
      requested_end_at: body.requestedEndAt,
      duration_minutes: durationMinutes,
      status: initialStatus,
      last_action_by: 'student',
      student_notes: body.studentNotes || null,
      community_id: body.communityId ?? null,
      price_ttd: paidClassesEnabled ? priceTtd : 0,
      payer_id: userId,
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
    throw new Error(insertError?.message || 'Failed to create booking');
  }

  await admin.from('booking_messages').insert({
    booking_id: booking.id,
    sender_id: childId,
    message_type: 'system',
    body: paidClassesEnabled
      ? 'Parent created booking and approved payment handoff'
      : 'Parent created booking request',
  });

  if (!paidClassesEnabled) {
    await admin.from('notifications').insert({
      user_id: body.tutorId,
      type: 'booking_request_received',
      title: 'New Booking Request',
      message: `${childProfile?.full_name || 'A student'} has a new booking request`,
      link: `/tutor/bookings/${booking.id}`,
      created_at: new Date().toISOString(),
    });
  }

  return {
    success: true,
    booking_id: booking.id,
    status: initialStatus,
    requires_payment: paidClassesEnabled,
  };
}


export async function POST(request: NextRequest) {
  try {
    const supabase = getAuthedSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Body;
    const durationMinutes = body.durationMinutes ?? 60;
    const effectiveStudentId = body.studentId || user.id;

    if (
      !effectiveStudentId ||
      !body?.tutorId ||
      !body?.subjectId ||
      !body?.sessionTypeId ||
      !body?.requestedStartAt ||
      !body?.requestedEndAt
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (effectiveStudentId !== user.id) {
      const parentBooking = await createParentBooking(user.id, body, durationMinutes, supabase);
      return NextResponse.json(parentBooking);
    }

    const baseArgs = {
      p_student_id: effectiveStudentId,
      p_tutor_id: body.tutorId,
      p_subject_id: body.subjectId,
      p_session_type_id: body.sessionTypeId,
      p_requested_start_at: body.requestedStartAt,
      p_requested_end_at: body.requestedEndAt,
      p_student_notes: body.studentNotes || null,
      p_duration_minutes: durationMinutes,
      p_community_id: body.communityId ?? null,
    };

    // Backward-compatibility for environments where RPC arg list is older.
    // Try newest signature first, then progressively remove optional params.
    const rpcArgAttempts: Array<Record<string, unknown>> = [
      baseArgs,
      { ...baseArgs, p_community_id: undefined },
      { ...baseArgs, p_community_id: undefined, p_duration_minutes: undefined },
      {
        p_student_id: user.id,
        p_tutor_id: body.tutorId,
        p_subject_id: body.subjectId,
        p_requested_start_at: body.requestedStartAt,
        p_requested_end_at: body.requestedEndAt,
        p_student_notes: body.studentNotes || null,
      },
    ];

    let data: any = null;
    let finalError: any = null;

    for (const attemptArgs of rpcArgAttempts) {
      const cleanedArgs = Object.fromEntries(
        Object.entries(attemptArgs).filter(([, value]) => value !== undefined)
      );

      const result = await supabase.rpc('create_booking_request', cleanedArgs);
      if (!result.error) {
        data = result.data;
        finalError = null;
        break;
      }

      finalError = result.error;
      const isSignatureMismatch =
        result.error.code === 'PGRST202' ||
        /Could not find the function/i.test(result.error.message ?? '');

      if (!isSignatureMismatch) {
        break;
      }
    }

    if (finalError) {
      return NextResponse.json({ error: finalError.message }, { status: 400 });
    }

    // Temporary launch behavior: force ALL bookings to be free when paid classes are disabled.
    // This does not remove paid logic; it overrides the created booking's pricing fields.
    if (!isPaidClassesEnabled() && data?.booking_id) {
      const admin = getServiceClient();
      await admin
        .from('bookings')
        .update({
          price_ttd: 0,
          platform_fee_pct: 0,
          platform_fee_ttd: 0,
          tutor_payout_ttd: 0,
          payment_required: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.booking_id);
    }

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

