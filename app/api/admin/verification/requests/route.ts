// =====================================================
// GET VERIFICATION REQUESTS (ADMIN)
// =====================================================
// Returns verification requests filtered by status

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
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
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status') || 'READY_FOR_REVIEW';

  try {
    let query = supabase
      .from('tutor_verification_requests')
      .select(`
        id,
        tutor_id,
        status,
        created_at,
        reviewed_at,
        file_type,
        original_filename,
        tutor:tutor_id (
          id,
          full_name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching verification requests:', error);
      return NextResponse.json({ 
        error: 'Failed to fetch requests', 
        details: error.message,
        hint: error.hint 
      }, { status: 500 });
    }

    console.log(`Fetched ${data?.length || 0} verification requests with status: ${status}`);
    return NextResponse.json({ requests: data || [] });
  } catch (error) {
    console.error('Exception fetching verification requests:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

