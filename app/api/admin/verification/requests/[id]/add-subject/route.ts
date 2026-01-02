// =====================================================
// ADD VERIFIED SUBJECT (ADMIN)
// =====================================================
// Admin adds a verified subject with grade to tutor's profile

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
  const requestId = params.id;

  try {
    // Validate request exists and get tutor_id
    const { data: verificationRequest, error: requestError } = await supabase
      .from('tutor_verification_requests')
      .select('tutor_id, status')
      .eq('id', requestId)
      .single();

    if (requestError || !verificationRequest) {
      return NextResponse.json({ error: 'Verification request not found' }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const { subject_id, exam_type, grade, year, session } = body;

    // Validate required fields
    if (!subject_id || !exam_type || !grade) {
      return NextResponse.json(
        { error: 'Missing required fields: subject_id, exam_type, grade' },
        { status: 400 }
      );
    }

    // Validate exam_type
    if (!['CSEC', 'CAPE'].includes(exam_type)) {
      return NextResponse.json(
        { error: 'exam_type must be CSEC or CAPE' },
        { status: 400 }
      );
    }

    // Validate grade
    const gradeNum = parseInt(grade);
    if (isNaN(gradeNum) || gradeNum < 1 || gradeNum > 9) {
      return NextResponse.json(
        { error: 'grade must be between 1 and 9' },
        { status: 400 }
      );
    }

    // Validate year if provided
    if (year) {
      const yearNum = parseInt(year);
      if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2030) {
        return NextResponse.json(
          { error: 'year must be between 2000 and 2030' },
          { status: 400 }
        );
      }
    }

    // Check if subject exists
    const { data: subject, error: subjectError } = await supabase
      .from('subjects')
      .select('id, name')
      .eq('id', subject_id)
      .single();

    if (subjectError || !subject) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    // Insert verified subject
    const { data, error } = await supabase
      .from('tutor_verified_subjects')
      .insert({
        tutor_id: verificationRequest.tutor_id,
        subject_id,
        exam_type,
        grade: gradeNum,
        year: year ? parseInt(year) : null,
        session: session || null,
        verified_by_admin_id: auth.profile!.id,
        source_request_id: requestId,
        is_public: true // Default to public - tutor can hide later if needed
      })
      .select(`
        *,
        subjects:subject_id (
          id,
          name,
          curriculum,
          level
        )
      `)
      .single();

    if (error) {
      console.error('Error adding verified subject:', error);
      return NextResponse.json({ error: 'Failed to add verified subject' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Verified subject added successfully',
      subject: data
    });
  } catch (error) {
    console.error('Exception adding verified subject:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

