// =====================================================
// GET TUTOR'S VERIFIED SUBJECTS
// =====================================================
// Returns all verified subjects for authenticated tutor (public + hidden)

import { NextResponse } from 'next/server';
import { requireTutor } from '@/lib/middleware/tutorAuth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
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

  try {
    const { data, error } = await supabase
      .from('tutor_verified_subjects')
      .select(`
        *,
        subjects:subject_id (
          id,
          name,
          curriculum,
          level
        ),
        verifier:verified_by_admin_id (
          id,
          full_name
        )
      `)
      .eq('tutor_id', auth.profile!.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching verified subjects:', error);
      return NextResponse.json({ error: 'Failed to fetch verified subjects' }, { status: 500 });
    }

    return NextResponse.json({ subjects: data || [] });
  } catch (error) {
    console.error('Exception fetching verified subjects:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

