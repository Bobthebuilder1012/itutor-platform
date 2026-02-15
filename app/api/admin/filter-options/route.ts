// =====================================================
// GET FILTER OPTIONS FOR ADMIN ACCOUNT MANAGEMENT
// =====================================================
// Returns list of schools and subjects for filtering

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Can't set cookies in API routes
            }
          },
        },
      }
    );

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin privileges
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_reviewer, role')
      .eq('id', user.id)
      .single();

    if (!profile || (!profile.is_reviewer && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (type === 'schools') {
      // Get distinct schools from profiles
      const { data: schoolsData, error: schoolsError } = await supabase
        .from('profiles')
        .select('school')
        .not('school', 'is', null)
        .neq('school', '');

      if (schoolsError) {
        console.error('Error fetching schools:', schoolsError);
        return NextResponse.json({ schools: [] });
      }

      // Get unique schools and sort alphabetically
      const seen: Record<string, true> = {};
const uniqueSchools = schoolsData
  .map((p: any) => p.school)
  .filter((s: string) => s && !seen[s] && (seen[s] = true))
  .sort();

      return NextResponse.json({ schools: uniqueSchools });
    }

    if (type === 'subjects') {
      // Get all subjects from subjects table
      const { data: subjectsData, error: subjectsError } = await supabase
        .from('subjects')
        .select('id, name')
        .order('name');

      if (subjectsError) {
        console.error('Error fetching subjects:', subjectsError);
        return NextResponse.json({ subjects: [] });
      }

      return NextResponse.json({ subjects: subjectsData });
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}












