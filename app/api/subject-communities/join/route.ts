import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { joinSubjectCommunity, postSystemMessage } from '@/lib/subject-communities';

export async function POST(request: Request) {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const communityId = body?.communityId ?? body?.community_id;
    if (!communityId) return NextResponse.json({ ok: false, error: 'communityId required' }, { status: 400 });

    const result = await joinSubjectCommunity(supabase, user.id, communityId);
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });

    // Post system message "X joined the community"
    const { data: profile } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).single();
    const displayName = profile?.full_name || profile?.username || 'A student';
    const admin = getServiceClient();
    await postSystemMessage(admin, communityId, `${displayName} joined the community`);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[subject-communities/join]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
