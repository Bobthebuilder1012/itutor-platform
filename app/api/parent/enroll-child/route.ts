// Parent joins a group class ON BEHALF of a linked child. This is the group
// equivalent of the parent-1:1-booking path — it did not exist before (group
// join routes all assumed auth.uid() == the student). Authorization mirrors
// createParentBooking: verify parent_child_links, then write the child's
// membership via the service client. Runs the child schedule-conflict check.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext, requireParentChild } from '@/lib/server/parentAccess';
import { findGroupEnrollmentConflict, conflictMessage } from '@/lib/services/scheduleConflict';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const body = (await request.json().catch(() => ({}))) as { childId?: string; groupId?: string };
    const childId = body.childId;
    const groupId = body.groupId;
    if (!childId || !groupId) return NextResponse.json({ error: 'Missing childId or groupId' }, { status: 400 });

    const child = await requireParentChild(parentProfile.id, childId); // 404 if not linked

    const { data: group } = await admin
      .from('groups')
      .select('id, tutor_id, require_join_requests, archived_at')
      .eq('id', groupId)
      .maybeSingle();
    if (!group) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    if (group.archived_at) return NextResponse.json({ error: 'This class is no longer available' }, { status: 410 });

    // Already a member?
    const { data: existing } = await admin
      .from('group_members')
      .select('id, status')
      .eq('group_id', groupId)
      .eq('user_id', childId)
      .maybeSingle();
    if (existing && ['active', 'pending_approval', 'invited'].includes(existing.status)) {
      return NextResponse.json({ error: 'This child is already in this class.', status: existing.status }, { status: 409 });
    }

    // Child schedule conflict (the group's upcoming occurrences vs the child's schedule).
    const conflict = await findGroupEnrollmentConflict(admin, childId, groupId);
    if (conflict) return NextResponse.json({ error: conflictMessage(conflict) }, { status: 409 });

    const memberStatus = group.require_join_requests ? 'pending_approval' : 'active';
    const nowISO = new Date().toISOString();

    if (existing) {
      const { error } = await admin
        .from('group_members')
        .update({ status: memberStatus, status_changed_at: nowISO, status_reason: null })
        .eq('id', existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await admin
        .from('group_members')
        .insert({ group_id: groupId, user_id: childId, status: memberStatus, initiated_by: 'parent' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Notify the tutor (attributed to the parent acting for the child).
    const childName = child.display_name || child.full_name || 'A student';
    try {
      await admin.from('notifications').insert({
        user_id: group.tutor_id,
        type: 'new_class_member',
        title: memberStatus === 'pending_approval' ? 'New join request' : 'New student joined',
        message: `${childName} (added by their parent) ${memberStatus === 'pending_approval' ? 'requested to join' : 'joined'} your class.`,
        link: `/tutor/classes/${groupId}?tab=roster`,
      });
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true, status: memberStatus });
  } catch (error) {
    if (error instanceof ParentAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
