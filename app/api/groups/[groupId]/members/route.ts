import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveGroupActor } from '@/lib/auth/groupAccess';
import { findGroupEnrollmentConflict, conflictMessage } from '@/lib/services/scheduleConflict';

type Params = { params: Promise<{ groupId: string }> };
function isSchemaMismatch(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return code === '42703' || code === '42P01' || code === 'PGRST200' || code === 'PGRST205' || msg.includes('does not exist') || msg.includes('relationship') || msg.includes('embed');
}

// GET /api/groups/[groupId]/members — list members (tutor sees all, members see approved)
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    // Tutor (or a superadmin acting as tutor) sees all members; others see only
    // approved/active/invited.
    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    const isTutor = actor.actingAsTutor;

    let query: any = service
      .from('group_members')
      .select('id, group_id, user_id, status, joined_at, profile:profiles!group_members_user_id_fkey(id, full_name, avatar_url, role, email)')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true });

    if (!isTutor) {
      query = query.in('status', ['approved', 'active', 'invited']);
    }

    let { data: members, error } = await query;
    if (error && isSchemaMismatch(error)) {
      // Fallback: drop role column + try without FK hint
      query = service
        .from('group_members')
        .select('id, group_id, user_id, status, joined_at, profile:profiles!group_members_user_id_fkey(id, full_name, avatar_url, email, phone)')
        .eq('group_id', groupId)
        .order('joined_at', { ascending: true });
      if (!isTutor) {
        query = query.in('status', ['approved', 'active', 'invited']);
      }
      ({ data: members, error } = await query);
    }
    if (error && isSchemaMismatch(error)) {
      return NextResponse.json({ members: [] });
    }
    if (error) throw error;

    return NextResponse.json({ members: members ?? [] });
  } catch (err) {
    console.error('[GET /api/groups/[groupId]/members]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups/[groupId]/members — request to join a group (student)
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    // Check group exists and is not archived
    const { data: group } = await service
      .from('groups')
      .select('id, tutor_id, name')
      .eq('id', groupId)
      .is('archived_at', null)
      .single();

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    if (group.tutor_id === user.id) {
      return NextResponse.json({ error: 'Tutor cannot join their own group' }, { status: 400 });
    }

    // Check for existing membership
    const { data: existing } = await service
      .from('group_members')
      .select('id, status')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    // Active/pending/invited membership — block duplicate
    if (existing && !['removed', 'banned', 'denied'].includes(existing.status)) {
      return NextResponse.json({ member: existing, already_exists: true });
    }

    // Child schedule conflict — the student's own upcoming schedule (1:1 + group)
    // vs this class's occurrences. Applies regardless of who initiates the join.
    const conflict = await findGroupEnrollmentConflict(service, user.id, groupId);
    if (conflict) {
      return NextResponse.json({ error: conflictMessage(conflict) }, { status: 409 });
    }

    // Determine initial status based on group's join-request setting
    const { data: groupSettings } = await service
      .from('groups')
      .select('require_join_requests')
      .eq('id', groupId)
      .single();

    const initialStatus = groupSettings?.require_join_requests ? 'pending' : 'approved';

    // Reuse existing row (update) if the student previously left/was removed
    let member: any;
    let error: any;
    if (existing) {
      ({ data: member, error } = await service
        .from('group_members')
        .update({ status: initialStatus, joined_at: new Date().toISOString(), action_reason: null, actioned_at: null, actioned_by: null })
        .eq('id', existing.id)
        .select()
        .single());
    } else {
      ({ data: member, error } = await service
        .from('group_members')
        .insert({ group_id: groupId, user_id: user.id, status: initialStatus })
        .select()
        .single());
    }

    if (error) throw error;

    // Notify tutor of new join request (non-critical)
    try {
      const groupName = (group as any)?.name ?? 'your class';
      const { data: studentProfile } = await service.from('profiles').select('full_name, display_name').eq('id', user.id).single();
      const studentName = (studentProfile as any)?.display_name || (studentProfile as any)?.full_name || 'A student';
      const isRequest = initialStatus === 'pending';
      // 'join_request' was not a permitted notifications.type until migration
      // 203, so this insert threw and the empty catch discarded it — tutors
      // were never told anyone had asked to join. Errors are logged now so the
      // same class of failure can't hide again.
      const { error: notifyError } = await service.from('notifications').insert({
        user_id: group.tutor_id,
        type: isRequest ? 'join_request' : 'new_class_member',
        title: isRequest ? `${studentName} wants to join ${groupName}` : `${studentName} joined ${groupName}`,
        message: isRequest
          ? `${studentName} has requested to join your class "${groupName}". Go to the Roster to approve or decline.`
          : `${studentName} has joined "${groupName}".`,
        link: `/tutor/classes/${groupId}?tab=roster`,
        group_id: groupId,
        metadata: { groupId, studentId: user.id },
      });
      if (notifyError) {
        console.error('[members POST] notification insert failed:', notifyError);
      }
    } catch (err) {
      console.error('[members POST] notification threw:', err);
    }

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/members]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
