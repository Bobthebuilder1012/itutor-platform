import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getJoinableSubjectCommunities } from '@/lib/subject-communities';

export async function GET(request: Request) {
  try {
    const authSupabase = await getServerClient();
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') ?? '';
    const supabase = getServiceClient();
    const communities = await getJoinableSubjectCommunities(supabase, user.id, q || undefined);
    return NextResponse.json({ ok: true, communities });
  } catch (e) {
    console.error('[subject-communities/search]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
