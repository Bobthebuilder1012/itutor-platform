import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveGroupActor, auditAdminOverride } from '@/lib/auth/groupAccess';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; memberId: string }> };

// POST /api/classes/[id]/members/[memberId]/approve
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id: classId, memberId } = await params;
    const supabase = await getServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    // Verify tutor owns the class (or superadmin acting as tutor). Use the
    // service client for the member read/update below so an admin override isn't
    // blocked by group_members RLS (tutor-only).
    const service = getServiceClient();
    const actor = await resolveGroupActor({ groupId: classId, userId: user.id, email: user.email });
    if (actor.notFound) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    if (!actor.authorized) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    // Load and guard member status
    const { data: member, error: memberError } = await service
      .from('group_members')
      .select('id, user_id, status')
      .eq('id', memberId)
      .eq('group_id', classId)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!member) return NextResponse.json({ ok: false, error: 'member_not_found' }, { status: 404 });
    if (member.status !== 'pending_approval') {
      return NextResponse.json({ ok: false, error: 'invalid_status', current: member.status }, { status: 409 });
    }

    const { data: updated, error: updateError } = await service
      .from('group_members')
      .update({ status: 'active', status_changed_at: new Date().toISOString(), status_changed_by: user.id })
      .eq('id', memberId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Notify the student
    await service
      .from('notifications')
      .insert({ user_id: member.user_id, type: 'new_class_member', group_id: classId, actor_id: user.id })
      .select();

    await auditAdminOverride(actor, 'member.approve', { memberId, targetUserId: member.user_id });

    return NextResponse.json({ ok: true, member: updated });
  } catch (err) {
    console.error('[POST /api/classes/[id]/members/[memberId]/approve]', err);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
