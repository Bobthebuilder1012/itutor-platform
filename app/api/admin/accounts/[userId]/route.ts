// =====================================================
// GET USER ACCOUNT DETAILS (ADMIN)
// =====================================================
// Admin can view detailed information about a specific user

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
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
    
    const { userId } = params;

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch additional data based on role
    let additionalData: any = {};

    if (profile.role === 'parent') {
      // Fetch children
      const { data: children } = await supabase
        .from('parent_child_links')
        .select(`
          child_id,
          created_at,
          child:profiles!parent_child_links_child_id_fkey(
            id,
            full_name,
            email,
            form_level
          )
        `)
        .eq('parent_id', userId);

      additionalData.children = children;
    }

    if (profile.role === 'student') {
      // Fetch parent links
      const { data: parents } = await supabase
        .from('parent_child_links')
        .select(`
          parent_id,
          created_at,
          parent:profiles!parent_child_links_parent_id_fkey(
            id,
            full_name,
            email
          )
        `)
        .eq('child_id', userId);

      additionalData.parents = parents;
    }

    if (profile.role === 'tutor') {
      // Fetch tutor subjects
      const { data: subjects } = await supabase
        .from('tutor_subjects')
        .select(`
          *,
          subject:subjects(name, curriculum, level)
        `)
        .eq('tutor_id', userId);

      // Fetch verified subjects
      const { data: verifiedSubjects } = await supabase
        .from('tutor_verified_subjects')
        .select(`
          *,
          subject:subjects(name, curriculum, level)
        `)
        .eq('tutor_id', userId);

      additionalData.subjects = subjects;
      additionalData.verifiedSubjects = verifiedSubjects;
    }

    // Fetch session statistics
    const { count: totalSessions } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .or(`student_id.eq.${userId},tutor_id.eq.${userId}`);

    const { count: completedSessions } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .or(`student_id.eq.${userId},tutor_id.eq.${userId}`)
      .eq('status', 'completed');

    // Fetch ratings given (if student) or received (if tutor)
    let ratings: any = null;
    if (profile.role === 'student') {
      const { data: ratingsGiven } = await supabase
        .from('ratings')
        .select('*')
        .eq('student_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      ratings = { given: ratingsGiven };
    } else if (profile.role === 'tutor') {
      const { data: ratingsReceived } = await supabase
        .from('ratings')
        .select('*')
        .eq('tutor_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      ratings = { received: ratingsReceived };
    }

    // Fetch suspension history
    const { data: suspensionHistory } = await supabase
      .from('profiles')
      .select('is_suspended, suspension_reason, suspended_at, suspended_by, suspension_lifted_at, suspension_lifted_by')
      .eq('id', userId)
      .single();

    return NextResponse.json({
      profile,
      additionalData,
      statistics: {
        totalSessions: totalSessions || 0,
        completedSessions: completedSessions || 0,
      },
      ratings,
      suspensionHistory,
    });
  } catch (error) {
    console.error('Error in GET /api/admin/accounts/[userId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

