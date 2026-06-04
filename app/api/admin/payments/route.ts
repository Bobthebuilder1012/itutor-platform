// =====================================================
// GET ALL PAYMENTS/SESSIONS (ADMIN)
// =====================================================
// Admin can view all payment transactions with filters

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const cookieStore = cookies();
    const supabase = createServerClient(
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
    
    const { searchParams } = new URL(request.url);
    
    const school = searchParams.get('school');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const studentSearch = searchParams.get('student');
    const tutorSearch = searchParams.get('tutor');
    const status = searchParams.get('status');

    // Fetch sessions with student and tutor profile information.
    // NOTE: the legacy `session_date` and `subject_id` columns no longer exist
    // on the sessions table. Use `scheduled_start_at` and pull the subject from
    // the parent booking via `booking_id`.
    // payout_amount_ttd is the canonical column (mig 018 / 129). The legacy
    // tutor_payout_ttd from mig 020 is still on the table but nothing writes
    // to it any more, so summing it gave $0 in the totals card.
    let query = supabase
      .from('sessions')
      .select(`
        id,
        booking_id,
        student_id,
        tutor_id,
        scheduled_start_at,
        duration_minutes,
        charge_amount_ttd,
        platform_fee_ttd,
        payout_amount_ttd,
        tutor_payout_ttd,
        status,
        payment_status,
        created_at
      `)
      .order('scheduled_start_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (startDate) {
      query = query.gte('scheduled_start_at', startDate);
    }

    if (endDate) {
      query = query.lte('scheduled_start_at', endDate);
    }

    const { data: sessions, error } = await query;

    if (error) {
      console.error('Error fetching payments:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch payments', 
        details: error.message 
      }, { status: 500 });
    }

    // Fetch student, tutor, and subject details separately
    const unique = <T,>(arr: T[]) => {
      const seen = new Set<T>();
      return arr.filter(x => {
        if (seen.has(x)) return false;
        seen.add(x);
        return true;
      });
    };
    
    const studentIds = unique(
      (sessions ?? []).map(s => s.student_id).filter(Boolean)
    );

    const tutorIds = unique(
      (sessions ?? []).map(s => s.tutor_id).filter(Boolean)
    );

    const bookingIds = unique(
      (sessions ?? []).map(s => s.booking_id).filter(Boolean)
    );

    // Subject lives on bookings, not sessions — fetch the bookings first to
    // get the subject_id, then resolve subject labels.
    const bookingsData = bookingIds.length > 0
      ? await supabase.from('bookings').select('id, subject_id').in('id', bookingIds)
      : { data: [], error: null };
    const bookingSubjectMap = new Map(
      (bookingsData.data ?? []).map((b: any) => [b.id, b.subject_id])
    );
    const subjectIds = unique(
      Array.from(bookingSubjectMap.values()).filter(Boolean) as string[]
    );

    const [studentsData, tutorsData, subjectsData] = await Promise.all([
      studentIds.length > 0
        ? supabase.from('profiles').select('id, full_name, email, school, country').in('id', studentIds)
        : Promise.resolve({ data: [], error: null }),
      tutorIds.length > 0
        ? supabase.from('profiles').select('id, full_name, email').in('id', tutorIds)
        : Promise.resolve({ data: [], error: null }),
      subjectIds.length > 0
        ? supabase.from('subjects').select('id, label, name').in('id', subjectIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const studentsMap = new Map(studentsData.data?.map((s: any) => [s.id, s]) || []);
    const tutorsMap = new Map(tutorsData.data?.map((t: any) => [t.id, t]) || []);
    const subjectsMap = new Map(subjectsData.data?.map((s: any) => [s.id, s]) || []);

    // Map sessions → response shape expected by the UI. The page currently
    // reads `session_date`, so we expose `scheduled_start_at` under that key.
    const enrichedSessions = (sessions ?? []).map((session: any) => {
      const subjectId = bookingSubjectMap.get(session.booking_id) ?? null;
      const subjectRow: any = subjectId ? subjectsMap.get(subjectId) || null : null;
      return {
        ...session,
        session_date: session.scheduled_start_at,
        tutor_payout_ttd:
          session.payout_amount_ttd ?? session.tutor_payout_ttd ?? 0,
        student: studentsMap.get(session.student_id) || null,
        tutor: tutorsMap.get(session.tutor_id) || null,
        subject: subjectRow
          ? { ...subjectRow, label: subjectRow.label || subjectRow.name }
          : null,
      };
    });

    // Apply client-side filters for school, student, and tutor
    let filteredSessions = enrichedSessions;

    if (school && school !== 'all') {
      filteredSessions = filteredSessions.filter(
        (session: any) => session.student?.school?.toLowerCase().includes(school.toLowerCase())
      );
    }

    if (studentSearch) {
      filteredSessions = filteredSessions.filter(
        (session: any) => 
          session.student?.full_name?.toLowerCase().includes(studentSearch.toLowerCase()) ||
          session.student?.email?.toLowerCase().includes(studentSearch.toLowerCase())
      );
    }

    if (tutorSearch) {
      filteredSessions = filteredSessions.filter(
        (session: any) => 
          session.tutor?.full_name?.toLowerCase().includes(tutorSearch.toLowerCase()) ||
          session.tutor?.email?.toLowerCase().includes(tutorSearch.toLowerCase())
      );
    }

    // Calculate totals
    const totalRevenue = filteredSessions.reduce(
      (sum: number, session: any) => sum + (parseFloat(session.platform_fee_ttd) || 0), 
      0
    );

    const totalTransactionVolume = filteredSessions.reduce(
      (sum: number, session: any) => sum + (parseFloat(session.charge_amount_ttd) || 0), 
      0
    );

    const totalTutorPayouts = filteredSessions.reduce(
      (sum: number, session: any) => sum + (parseFloat(session.tutor_payout_ttd) || 0), 
      0
    );

    // Get unique schools for filter dropdown
    const schools = [...new Set(
      enrichedSessions
        .map((s: any) => s.student?.school)
        .filter((school: any) => school)
    )].sort();

    return NextResponse.json({ 
      sessions: filteredSessions,
      totals: {
        revenue: totalRevenue.toFixed(2),
        transactionVolume: totalTransactionVolume.toFixed(2),
        tutorPayouts: totalTutorPayouts.toFixed(2),
        sessionCount: filteredSessions.length,
      },
      schools,
    });
  } catch (error) {
    console.error('Error in GET /api/admin/payments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

