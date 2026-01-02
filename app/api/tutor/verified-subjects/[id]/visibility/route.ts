// =====================================================
// TOGGLE VERIFIED SUBJECT VISIBILITY
// =====================================================
// Tutors can toggle is_public field for their verified subjects

import { NextRequest, NextResponse } from 'next/server';
import { requireTutor } from '@/lib/middleware/tutorAuth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireTutor();
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
  const subjectId = params.id;

  try {
    const body = await request.json();
    const { is_public } = body;

    if (typeof is_public !== 'boolean') {
      return NextResponse.json({ error: 'is_public must be a boolean' }, { status: 400 });
    }

    // Verify ownership before update
    const { data: existing, error: fetchError } = await supabase
      .from('tutor_verified_subjects')
      .select('tutor_id')
      .eq('id', subjectId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Verified subject not found' }, { status: 404 });
    }

    if (existing.tutor_id !== auth.profile!.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update visibility
    const { data, error } = await supabase
      .from('tutor_verified_subjects')
      .update({ 
        is_public,
        visibility_updated_at: new Date().toISOString()
      })
      .eq('id', subjectId)
      .select()
      .single();

    if (error) {
      console.error('Error updating visibility:', error);
      return NextResponse.json({ error: 'Failed to update visibility' }, { status: 500 });
    }

    return NextResponse.json({ subject: data });
  } catch (error) {
    console.error('Exception updating visibility:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

