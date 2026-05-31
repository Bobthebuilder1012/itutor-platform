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

    // Guard: cannot archive a group with active subscriptions
    const { count: activeSubCount } = await service
      .from('group_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('enrollment_type', 'SUBSCRIPTION')
      .or(
        `status.in.(ACTIVE,GRACE,SUSPENDED),` +
        `and(status.eq.PENDING_PAYMENT,pending_payment_expires_at.gt.${now})`
      );

    if ((activeSubCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Cannot archive a group with active subscriptions.', active_subscriptions: activeSubCount },
        { status: 409 }
      );
    }

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
