// =====================================================
// GET ALL SUBJECTS
// =====================================================
// Returns all subjects for admins to select from

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
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
      .from('subjects')
      .select('id, name, label, curriculum, level')
      .order('curriculum', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching subjects:', error);
      return NextResponse.json({ error: 'Failed to fetch subjects' }, { status: 500 });
    }

    // Format subjects with proper names
    const subjects = (data || []).map(s => ({
      id: s.id,
      name: s.label || s.name,
      curriculum: s.curriculum || s.level || 'Other',
      level: s.level || ''
    }));

    return NextResponse.json({ subjects });
  } catch (error) {
    console.error('Exception fetching subjects:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}






