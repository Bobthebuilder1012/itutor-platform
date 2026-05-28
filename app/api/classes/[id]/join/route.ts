import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// POST /api/classes/[id]/join — student/parent initiates join
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { id: classId } = await params;
    const supabase = await getServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    // Load class
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, tutor_id, require_join_requests, archived_at, visibility, max_students')
      .eq('id', classId)
      .maybeSingle();

    if (groupError) throw groupError;
    if (!group) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    if (group.archived_at) return NextResponse.json({ ok: false, error: 'class_archived' }, { status: 410 });
    if (group.tutor_id === user.id) return NextResponse.json({ ok: false, error: 'cannot_join_own_class' }, { status: 400 });

    // Check not already a member
    const { data: existing } = await supabase
      .from('group_members')
      .select('id, status')
      .eq('group_id', classId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing && ['active', 'pending_approval', 'invited'].includes(existing.status)) {
      return NextResponse.json({ ok: false, error: 'already_member', status: existing.status }, { status: 409 });
    }

    const memberStatus = group.require_join_requests ? 'pending_approval' : 'active';

    let member: any;
    if (existing) {
      const { data: updated, error } = await supabase
        .from('group_members')
        .update({ status: memberStatus, status_changed_at: new Date().toISOString(), status_reason: null })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      member = updated;
    } else {
      const { data: inserted, error } = await supabase
        .from('group_members')
        .insert({ group_id: classId, user_id: user.id, status: memberStatus, initiated_by: 'student' })
        .select()
        .single();
      if (error) throw error;
      member = inserted;
    }

    // Always notify tutor — request vs instant join use different types
    const service = getServiceClient();
    const { data: studentProfile } = await service
      .from('profiles')
      .select('full_name, display_name')
      .eq('id', user.id)
      .maybeSingle();
    const studentName = studentProfile?.full_name || studentProfile?.display_name || 'A student';

    const notifPayload = memberStatus === 'pending_approval'
      ? {
          user_id: group.tutor_id,
          type: 'new_class_member',
          title: 'New join request',
          message: `${studentName} has requested to join your class.`,
          link: `/tutor/classes/${classId}?tab=roster`,
        }
      : {
          user_id: group.tutor_id,
          type: 'new_class_member',
          title: 'New student joined',
          message: `${studentName} has joined your class.`,
          link: `/tutor/classes/${classId}?tab=roster`,
        };
    try {
      await service.from('notifications').insert(notifPayload);
    } catch {
      // Non-critical — don't fail the join if notification fails
    }

    return NextResponse.json({ ok: true, member, status: memberStatus });
  } catch (err) {
    console.error('[POST /api/classes/[id]/join]', err);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
