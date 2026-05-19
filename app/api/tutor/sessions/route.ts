import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    // Verify caller is a tutor
    const { data: profile } = await service
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'tutor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch sessions with booking + student + subject details
    const { data: sessions, error } = await service
      .from('sessions')
      .select(`
        id, booking_id, status, join_url, duration_minutes,
        scheduled_start_at, scheduled_end_at,
        booking:bookings(
          student_id, subject_id, payment_status,
          student:profiles!bookings_student_id_fkey(full_name, display_name),
          subject:subjects(label, name),
          payment_required, price_ttd
        )
      `)
      .eq('tutor_id', user.id)
      .order('scheduled_start_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[GET /api/tutor/sessions] sessions query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch pending bookings (no session yet)
    const { data: pendingBookings } = await service
      .from('bookings')
      .select(`
        id, requested_start_at, requested_end_at, payment_status,
        student:profiles!bookings_student_id_fkey(id, full_name, display_name),
        subject:subjects(label, name)
      `)
      .eq('tutor_id', user.id)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false });

    // Check if tutor has any ratings (for reviewed flag)
    const sessionIds = (sessions ?? []).map(s => s.id);
    let ratedSessionIds = new Set<string>();
    if (sessionIds.length > 0) {
      const { data: ratings } = await service
        .from('ratings')
        .select('session_id')
        .in('session_id', sessionIds);
      ratedSessionIds = new Set((ratings ?? []).map(r => r.session_id));
    }

    const mapped = (sessions ?? []).map((s: any) => {
      const booking = Array.isArray(s.booking) ? s.booking[0] : s.booking;
      const student = booking?.student ? (Array.isArray(booking.student) ? booking.student[0] : booking.student) : null;
      const subject = booking?.subject ? (Array.isArray(booking.subject) ? booking.subject[0] : booking.subject) : null;
      const startAt = s.scheduled_start_at;
      const endAt = s.scheduled_end_at;
      const pastStatuses = ['COMPLETED', 'COMPLETED_ASSUMED', 'NO_SHOW_STUDENT', 'EARLY_END_SHORT', 'completed', 'no_show'];
      const isPast = pastStatuses.includes(s.status) || (endAt && new Date(endAt).getTime() < Date.now());
      return {
        id: s.id,
        bookingId: s.booking_id,
        date: startAt,
        endDate: endAt,
        durationMin: s.duration_minutes ?? 60,
        subject: subject?.label || subject?.name || 'Session',
        studentName: student?.display_name || student?.full_name || 'Student',
        studentId: booking?.student_id ?? null,
        joinUrl: s.join_url ?? null,
        status: isPast ? 'past' : 'upcoming',
        attendance: null,
        paymentStatus: (() => {
          const requiresPayment = booking?.payment_required || Number(booking?.price_ttd ?? 0) > 0;
          if (!requiresPayment) return null;
          if (booking?.payment_status === 'paid') return 'paid';
          if (booking?.payment_status === 'failed') return 'overdue';
          return 'pending';
        })(),
        reviewed: ratedSessionIds.has(s.id),
      };
    });

    const pendingMapped = (pendingBookings ?? []).map((b: any) => {
      const student = Array.isArray(b.student) ? b.student[0] : b.student;
      const subject = Array.isArray(b.subject) ? b.subject[0] : b.subject;
      const durationMin = b.requested_start_at && b.requested_end_at
        ? Math.round((new Date(b.requested_end_at).getTime() - new Date(b.requested_start_at).getTime()) / 60000)
        : 60;
      return {
        id: `pending-${b.id}`,
        bookingId: b.id,
        date: b.requested_start_at,
        endDate: b.requested_end_at,
        durationMin,
        subject: subject?.label || subject?.name || 'Session request',
        studentName: student?.display_name || student?.full_name || 'Student',
        studentId: student?.id ?? null,
        joinUrl: null,
        status: 'pending',
        attendance: null,
        paymentStatus: null,
        reviewed: false,
      };
    });

    return NextResponse.json({ sessions: [...mapped, ...pendingMapped] });
  } catch (err: any) {
    console.error('[GET /api/tutor/sessions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
