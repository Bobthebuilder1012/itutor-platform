// =====================================================
// GET VERIFIED TUTORS (ADMIN/REVIEWER)
// =====================================================
// Returns tutors with tutor_verification_status = VERIFIED (service role, bypasses RLS)

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const supabase = getServiceClient();

  try {
    const { data: tutorData, error: tutorError } = await supabase
      .from('profiles')
      .select('id, full_name, display_name, username, email, avatar_url, school, country, tutor_verified_at')
      .eq('role', 'tutor')
      .eq('tutor_verification_status', 'VERIFIED')
      .order('tutor_verified_at', { ascending: false });

    if (tutorError) {
      console.error('Error fetching verified tutors:', tutorError);
      return NextResponse.json({ error: 'Failed to fetch verified tutors' }, { status: 500 });
    }

    const tutorIds = (tutorData || []).map(t => t.id);
    if (tutorIds.length === 0) {
      return NextResponse.json({ tutors: [] });
    }

    const [subjectCountsRes, bookingCountsRes, ratingsRes] = await Promise.all([
      supabase.from('tutor_subjects').select('tutor_id').in('tutor_id', tutorIds),
      supabase.from('bookings').select('tutor_id').in('tutor_id', tutorIds).in('status', ['CONFIRMED', 'COMPLETED']),
      supabase.from('ratings').select('tutor_id, stars').in('tutor_id', tutorIds),
    ]);

    const subjectCountMap = new Map<string, number>();
    (subjectCountsRes.data || []).forEach(item => {
      subjectCountMap.set(item.tutor_id, (subjectCountMap.get(item.tutor_id) || 0) + 1);
    });
    const bookingCountMap = new Map<string, number>();
    (bookingCountsRes.data || []).forEach(item => {
      bookingCountMap.set(item.tutor_id, (bookingCountMap.get(item.tutor_id) || 0) + 1);
    });
    const ratingsMap = new Map<string, number[]>();
    (ratingsRes.data || []).forEach(item => {
      if (!ratingsMap.has(item.tutor_id)) ratingsMap.set(item.tutor_id, []);
      ratingsMap.get(item.tutor_id)!.push(item.stars);
    });

    const tutors = (tutorData || []).map(tutor => {
      const tutorRatings = ratingsMap.get(tutor.id) || [];
      const avgRating = tutorRatings.length > 0
        ? tutorRatings.reduce((sum, r) => sum + r, 0) / tutorRatings.length
        : null;
      return {
        ...tutor,
        subject_count: subjectCountMap.get(tutor.id) || 0,
        total_bookings: bookingCountMap.get(tutor.id) || 0,
        average_rating: avgRating,
      };
    });

    return NextResponse.json({ tutors });
  } catch (error) {
    console.error('Exception fetching verified tutors:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
