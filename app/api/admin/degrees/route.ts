import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createRouteHandlerSupabase } from '@/lib/api/supabaseRouteClient';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const status = request.nextUrl.searchParams.get('status') || 'pending';
  if (!['pending', 'verified', 'rejected', 'all'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
  }

  const supabase = createRouteHandlerSupabase();

  let q = supabase
    .from('degrees')
    .select(
      `
      id,
      user_id,
      full_name,
      school_name,
      degree,
      field,
      graduation_year,
      status,
      rejection_reason,
      reviewed_at,
      created_at,
      user:profiles!degrees_user_id_fkey ( email, full_name, username ),
      degree_documents ( id, file_url, uploaded_at )
    `
    )
    .order('created_at', { ascending: false });

  if (status !== 'all') {
    q = q.eq('status', status);
  }

  const { data, error } = await q;

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ degrees: data ?? [] });
}
