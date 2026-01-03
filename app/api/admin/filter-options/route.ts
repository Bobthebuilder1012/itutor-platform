// =====================================================
// GET FILTER OPTIONS FOR ADMIN ACCOUNT MANAGEMENT
// =====================================================
// Returns list of schools and subjects for filtering

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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






