// =====================================================
// GET PUBLIC VERIFIED SUBJECTS
// =====================================================
// Returns only public verified subjects for a tutor
// Accessible by anyone (no auth required)

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: { tutorId: string } }
) {
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
  const tutorId = params.tutorId;

  try {
    // Verify tutor exists and is verified
    const { data: tutor, error: tutorError } = await supabase
      .from('profiles')
      .select('id, full_name, tutor_verification_status')
      .eq('id', tutorId)
      .eq('role', 'tutor')
      .single();

    if (tutorError || !tutor) {
      return NextResponse.json({ error: 'Tutor not found' }, { status: 404 });
    }

    if (tutor.tutor_verification_status !== 'VERIFIED') {
      return NextResponse.json({
        is_verified: false,
        subjects: []
      });
    }

    // Fetch only public verified subjects
    const { data, error } = await supabase
      .from('tutor_verified_subjects')
      .select(`
        id,
        exam_type,
        grade,
        year,
        session,
        verified_at,
        subjects:subject_id (
          id,
          name,
          curriculum,
          level
        )
      `)
      .eq('tutor_id', tutorId)
      .eq('is_public', true)
      .order('exam_type', { ascending: true })
      .order('grade', { ascending: true });

    if (error) {
      console.error('Error fetching public verified subjects:', error);
      return NextResponse.json({ error: 'Failed to fetch verified subjects' }, { status: 500 });
    }

    // Group by exam type
    const grouped = {
      CSEC: data?.filter(s => s.exam_type === 'CSEC') || [],
      CAPE: data?.filter(s => s.exam_type === 'CAPE') || []
    };

    return NextResponse.json({
      is_verified: true,
      tutor: {
        id: tutor.id,
        full_name: tutor.full_name
      },
      subjects: data || [],
      grouped
    });
  } catch (error) {
    console.error('Exception fetching public verified subjects:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

