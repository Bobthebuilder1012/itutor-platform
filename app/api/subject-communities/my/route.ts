import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getMySubjectCommunities } from '@/lib/subject-communities';

/** GET: list communities the current user has joined (for booking dropdown etc.) */
export async function GET() {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });

    const admin = getServiceClient();
    const communities = await getMySubjectCommunities(admin, user.id);
    return NextResponse.json({ ok: true, communities });
  } catch (e) {
    console.error('[subject-communities/my]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
