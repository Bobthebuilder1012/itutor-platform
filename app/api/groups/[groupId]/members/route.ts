import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { resolveGroupActor } from '@/lib/auth/groupAccess';
import { findGroupEnrollmentConflict, conflictMessage } from '@/lib/services/scheduleConflict';
import {
  createClassJoinRequest,
  performGroupJoin,
  resolveClassJoinGate,
} from '@/lib/server/classJoinRequests';

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

    // THE PARENT'S GATE, BEFORE THE TUTOR'S.
    // A child whose parent set "ask for approval first" does not join here —
    // they raise a request their parent answers. This route had no such check,
    // so the setting did nothing for group classes and the parent was never
    // told. Free classes included: approval is consent, not payment.
    const gate = await resolveClassJoinGate(service, user.id);
    if (gate.needsParentApproval) {
      const request = await createClassJoinRequest(service, {
        groupId,
        studentId: user.id,
        parentId: gate.parentId,
      });
      if (!request.ok) {
        return NextResponse.json({ error: 'Could not send the request.' }, { status: 400 });
      }
      // 202: accepted, not done. The UI must not show this as joined.
      return NextResponse.json(
        {
          parent_approval_required: true,
          request_id: request.requestId,
          already_pending: request.alreadyPending,
          message: request.alreadyPending
            ? 'Your parent already has this request.'
            : 'Sent to your parent for approval.',
        },
        { status: 202 }
      );
    }

    // Membership, the tutor's own gate, and the tutor's notification all live in
    // performGroupJoin, so an approved request and a direct join cannot produce
    // different roster rows or different notices.
    const joined = await performGroupJoin(service, { groupId, studentId: user.id });
    if (!joined.ok) {
      return NextResponse.json({ error: 'Could not join this class.' }, { status: 400 });
    }

    const { data: member } = await service
      .from('group_members')
      .select('id, group_id, user_id, status')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle();

    // The tutor's in-app notice AND the tutor's email are both raised inside
    // performGroupJoin — see the note there about the two never diverging.

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/members]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
