import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

// POST /api/groups/[groupId]/archive — archive a group (tutor only)
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
    const { data: existing } = await service
      .from('groups')
      .select('tutor_id')
      .eq('id', groupId)
      .single();

    if (!existing || existing.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const { error } = await service
      .from('groups')
      .update({ archived_at: now, status: 'ARCHIVED', archived_reason: 'manual' })
      .eq('id', groupId);

    if (error) throw error;

    await service.from('group_activity_log').insert({
      group_id: groupId,
      tutor_id: user.id,
      action: 'manual_archived',
      details: { archived_at: now },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/archive]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
