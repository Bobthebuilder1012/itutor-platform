import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { ensureSubjectCommunitiesForSchool } from '@/lib/subject-communities';

export async function POST() {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('institution_id').eq('id', user.id).single();
    const institutionId = profile?.institution_id;
    if (!institutionId) return NextResponse.json({ ok: false, error: 'No school set' }, { status: 400 });

    const admin = getServiceClient();
    const { created } = await ensureSubjectCommunitiesForSchool(admin, institutionId);
    return NextResponse.json({ ok: true, created });
  } catch (e) {
    console.error('[subject-communities/ensure]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
