import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isPaidClassesEnabled } from '@/lib/featureFlags/paidClasses';
import { getServiceClient } from '@/lib/supabase/server';

type Body = {
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

    if (
      !body?.tutorId ||
      !body?.subjectId ||
      !body?.sessionTypeId ||
      !body?.requestedStartAt ||
      !body?.requestedEndAt
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('create_booking_request', {
      p_student_id: user.id,
      p_tutor_id: body.tutorId,
      p_subject_id: body.subjectId,
      p_session_type_id: body.sessionTypeId,
      p_requested_start_at: body.requestedStartAt,
      p_requested_end_at: body.requestedEndAt,
      p_student_notes: body.studentNotes || null,
      p_duration_minutes: durationMinutes,
      p_community_id: body.communityId ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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

