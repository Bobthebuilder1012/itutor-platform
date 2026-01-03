// =====================================================
// GET VERIFICATION STATUS
// =====================================================
// Returns tutor's latest verification request status

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
      .from('tutor_verification_requests')
      .select(`
        id,
        status,
        created_at,
        reviewed_at,
        reviewer_reason,
        reviewed_by,
        reviewer:reviewed_by (
          full_name
        )
      `)
      .eq('tutor_id', auth.profile!.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('Error fetching verification status:', error);
      return NextResponse.json({ error: 'Failed to fetch verification status' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ 
        has_submission: false,
        status: null 
      });
    }

    return NextResponse.json({
      has_submission: true,
      request: {
        id: data.id,
        status: data.status,
        created_at: data.created_at,
        reviewed_at: data.reviewed_at,
        reviewer_reason: data.reviewer_reason,
        reviewer_name: (data.reviewer as any)?.full_name || null
      }
    });
  } catch (error) {
    console.error('Exception fetching verification status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

