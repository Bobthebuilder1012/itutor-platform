export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId } = await params;
    const service = getServiceClient();

    const { data: group } = await service.from('groups').select('tutor_id').eq('id', groupId).single();
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (group.tutor_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { entry_id, action, rating_participation, rating_understanding, rating_effort, comment } = body;

    if (!entry_id || !action) {
      return NextResponse.json({ error: 'entry_id and action are required' }, { status: 400 });
    }

    if (action === 'submit') {
      const { error } = await service
        .from('group_feedback_entries')
        .update({
          status: 'submitted',
          rating_participation: rating_participation ?? null,
          rating_understanding: rating_understanding ?? null,
          rating_effort: rating_effort ?? null,
          comment: comment ?? null,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry_id)
        .eq('group_id', groupId);

      if (error) throw error;
    } else if (action === 'skip') {
      const { error } = await service
        .from('group_feedback_entries')
        .update({
          status: 'skipped',
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry_id)
        .eq('group_id', groupId);

      if (error) throw error;
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[PATCH feedback/entries]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
