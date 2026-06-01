import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string; userId: string }> };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PATCH /api/groups/[groupId]/members/[userId] — approve or deny a join request (tutor only)
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { groupId, userId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    const { data: group } = await service
      .from('groups')
      .select('id, name, tutor_id')
      .eq('id', groupId)
      .single();

    if (!group || group.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { status, reason, suspended_until }: { status: string; reason?: string; suspended_until?: string | null } = body;

    const allowed = ['approved', 'active', 'denied', 'suspended', 'banned', 'removed'];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Only tutor can suspend/ban/remove; approve/denied can be done for join requests
    if (['suspended', 'banned', 'removed'].includes(status) && group.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const update: Record<string, unknown> = { status };
    if (reason !== undefined) update.action_reason = reason || null;
    if (['suspended', 'banned', 'removed'].includes(status)) {
      update.actioned_at = new Date().toISOString();
      update.actioned_by = user.id;
    }
    if (status === 'suspended') {
      update.suspended_until = suspended_until ?? null;
    }
    if (status === 'approved' || status === 'active') {
      update.action_reason = null;
      update.actioned_at = null;
      update.actioned_by = null;
      update.suspended_until = null;
    }

    // Read current status before update so we can send the right notification
    const { data: existing } = await service
      .from('group_members')
      .select('status')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();
    const previousStatus = (existing as any)?.status ?? null;

    const { data: member, error } = await service
      .from('group_members')
      .update(update)
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    // If removing a pending member → it's a request decline, not a removal
    const isDecline = status === 'removed' && previousStatus === 'pending';

    const notifMap: Record<string, { type: string; title: string; message: string }> = {
      approved:  { type: 'ENROLLMENT_CONFIRMED',    title: `You're in — ${group.name}!`,       message: `Your request to join "${group.name}" has been approved. You can now access the stream and upcoming sessions.` },
      denied:    { type: 'join_request_declined',   title: 'Request not approved',             message: `Your request to join "${group.name}" was not approved by the tutor.` },
      suspended: { type: 'group_member_suspended',  title: 'Access suspended', message: `Your access to "${group.name}" has been suspended${suspended_until ? ` until ${new Date(suspended_until).toLocaleDateString('en-TT', { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}.${reason ? ` Reason: ${reason}` : ''} You can still leave the class at any time.` },
      banned:    { type: 'group_member_banned',     title: 'Removed from class',               message: `You have been permanently removed from "${group.name}".${reason ? ` Reason: ${reason}` : ''}` },
      removed:   isDecline
        ? { type: 'join_request_declined', title: 'Request declined',   message: `Your request to join "${group.name}" was not approved by the tutor.` }
        : { type: 'group_member_removed',  title: 'Removed from class', message: `You have been removed from "${group.name}".${reason ? ` Reason: ${reason}` : ''}` },
    };
    const notif = notifMap[status];
    if (notif) {
      try {
        await service.from('notifications').insert({
          user_id: userId,
          ...notif,
          link: `/student/classes`,
          group_id: groupId,
        });
      } catch { /* Non-critical */ }
    }

    return NextResponse.json({ member });
  } catch (err) {
    console.error('[PATCH /api/groups/[groupId]/members/[userId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/groups/[groupId]/members/[userId] — student self-leave only
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { groupId, userId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden — use PATCH to manage other members' }, { status: 403 });
    }

    let reason: string | undefined;
    try { reason = (await req.json())?.reason; } catch { /* no body */ }

    const admin = getServiceClient();

    const { data: group } = await admin.from('groups').select('tutor_id, name, whatsapp_link, google_classroom_link').eq('id', groupId).single();

    // Delete the membership row
    const { error } = await admin
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (error) throw error;

    // Notify student + tutor (non-critical)
    try {
      const groupName = (group as any)?.name ?? 'the class';
      const reasonSuffix = reason ? ` Reason: "${reason}"` : '';

      // Get the student's name
      const { data: studentProfile } = await admin
        .from('profiles')
        .select('full_name, display_name')
        .eq('id', userId)
        .single();
      const studentName = (studentProfile as any)?.display_name || (studentProfile as any)?.full_name || 'A student';

      await admin.from('notifications').insert([
        {
          user_id: userId,
          type: 'group_left',
          title: 'Left class',
          message: `You have left "${groupName}".`,
          link: '/student/classes',
          group_id: groupId,
        },
        ...((group as any)?.tutor_id ? [{
          user_id: (group as any).tutor_id,
          type: 'student_left_class',
          title: `${studentName} left ${groupName}`,
          message: `${studentName} left "${groupName}".${reasonSuffix}${(group as any)?.whatsapp_link || (group as any)?.google_classroom_link ? ' Remember to remove them from your ' + [(group as any)?.whatsapp_link ? 'WhatsApp group' : null, (group as any)?.google_classroom_link ? 'Google Classroom' : null].filter(Boolean).join(' and ') + '.' : ''}`,
          link: `/tutor/classes/${groupId}`,
          group_id: groupId,
        }] : []),
      ]);
    } catch { /* ignore */ }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[DELETE /api/groups/[groupId]/members/[userId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
