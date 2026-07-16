import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveGroupActor, auditAdminOverride } from '@/lib/auth/groupAccess';

type Params = { params: Promise<{ groupId: string; userId: string }> };

export const dynamic = 'force-dynamic';

// POST — tutor pardons a banned student, removing the ban row so they can rejoin
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { groupId, userId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();

    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    if (actor.notFound) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (!actor.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const group = actor.group;

    // Delete the membership row — student must rejoin from scratch
    const { error } = await service
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (error) throw error;

    await auditAdminOverride(actor, 'member.pardon', { targetUserId: userId });

    // Notify student they can rejoin
    try {
      await service.from('notifications').insert({
        user_id: userId,
        type: 'join_request_approved',
        title: `Your ban from ${(group as any).name} has been lifted`,
        message: `You can now rejoin "${(group as any).name}". Browse the marketplace to request access.`,
        link: '/student/find-tutors',
        group_id: groupId,
      });
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST pardon]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
