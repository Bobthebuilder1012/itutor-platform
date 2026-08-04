import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveGroupActor, auditAdminOverride } from '@/lib/auth/groupAccess';

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
    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    if (actor.notFound || !actor.authorized) {
      return NextResponse.json({ error: 'Group not found or you do not own it' }, { status: 404 });
    }
    const group = actor.group;

    if (!group.archived_at) {
      return NextResponse.json({ error: 'Group is not archived' }, { status: 400 });
    }

    const { error: updateError } = await service
      .from('groups')
      .update({
        archived_at: null,
        archived_reason: null,
        status: 'PUBLISHED',
      })
      .eq('id', groupId);

    if (updateError) throw updateError;

    await service.from('group_activity_log').insert({
      group_id: groupId,
      tutor_id: user.id,
      action: 'restored',
      details: { restored_at: new Date().toISOString() },
    });

    // Record a visit to reset the inactivity timer
    await service.from('group_visits').insert({
      group_id: groupId,
      user_id: user.id,
    });

    await auditAdminOverride(actor, 'class.restore');

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/restore]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
