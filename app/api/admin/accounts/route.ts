// =====================================================
// GET ALL USER ACCOUNTS (ADMIN)
// =====================================================
// Admin can view all accounts across all roles

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
    
    const role = searchParams.get('role'); // Optional filter by role
    const suspended = searchParams.get('suspended'); // Optional filter by suspension status
    const search = searchParams.get('search'); // Optional search query
    const school = searchParams.get('school'); // Optional filter by school
    const subject = searchParams.get('subject'); // Optional filter by subject (for tutors/students)

    // Get all accounts with suspension fields
    let query = supabase
      .from('profiles')
      .select(`
        id, 
        role, 
        full_name, 
        email, 
        phone_number, 
        country, 
        school, 
        is_suspended,
        suspended_at,
        suspension_reason,
        created_at, 
        rating_average, 
        tutor_verification_status,
        parent_links:parent_child_links!parent_child_links_child_id_fkey(
          parent:profiles!parent_child_links_parent_id_fkey(
            id,
            full_name,
            email
          )
        )
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (role && role !== 'all') {
      query = query.eq('role', role);
    }

    // Filter by suspension status
    if (suspended === 'true') {
      query = query.eq('is_suspended', true);
    } else if (suspended === 'false') {
      query = query.eq('is_suspended', false);
    }

    // Filter by school
    if (school && school !== 'all') {
      query = query.eq('school', school);
    }

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    let { data: accounts, error } = await query;

    // If subject filter is applied, filter by tutors/students with that subject
    if (subject && subject !== 'all' && accounts) {
      // Get tutors teaching this subject
      const { data: tutorSubjects } = await supabase
        .from('tutor_subjects')
        .select('tutor_id')
        .eq('subject_id', subject);

      // Get students studying this subject (if user_subjects exists)
      const { data: userSubjects } = await supabase
        .from('user_subjects')
        .select('user_id')
        .eq('subject_id', subject);

      const tutorIds = tutorSubjects?.map((ts) => ts.tutor_id) || [];
      const studentIds = userSubjects?.map((us) => us.user_id) || [];
      const subjectUserIds = new Set([...tutorIds, ...studentIds]);

      // Filter accounts to only those with the subject
      accounts = accounts.filter((account) => subjectUserIds.has(account.id));
    }

    if (error) {
      console.error('Error fetching accounts:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch accounts', 
        details: error.message,
        hint: error.hint 
      }, { status: 500 });
    }

    console.log('=== ACCOUNTS FETCHED ===');
    console.log('Total accounts:', accounts?.length);
    console.log('Roles breakdown:');
    const roleBreakdown = accounts?.reduce((acc: any, account: any) => {
      acc[account.role] = (acc[account.role] || 0) + 1;
      return acc;
    }, {});
    console.log(roleBreakdown);
    console.log('Suspended accounts:', accounts?.filter((a: any) => a.is_suspended).length);
    console.log('========================');

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('Error in GET /api/admin/accounts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

