import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    // Only track if user is the tutor of this group
    const { data: group } = await service
      .from('groups')
      .select('tutor_id')
      .eq('id', groupId)
      .single();

    if (!group || group.tutor_id !== user.id) {
      return NextResponse.json({ success: false });
    }

    // Only log one visit per day to avoid spam
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await service
      .from('group_visits')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .gte('visited_at', oneDayAgo)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ success: true, tracked: false });
    }

    await service.from('group_visits').insert({
      group_id: groupId,
      user_id: user.id,
    });

    return NextResponse.json({ success: true, tracked: true });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/visit]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
