import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; memberId: string }> };

// POST /api/classes/[id]/members/[memberId]/reject
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: classId, memberId } = await params;
    const supabase = await getServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const { data: group } = await supabase
      .from('groups')
      .select('tutor_id')
      .eq('id', classId)
      .maybeSingle();

    if (!group || group.tutor_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const { data: member, error: memberError } = await supabase
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

    const body = await req.json().catch(() => ({}));
    const reason: string | null = body.reason ?? null;

    const { data: updated, error: updateError } = await supabase
      .from('group_members')
      .update({ status: 'rejected', status_changed_at: new Date().toISOString(), status_changed_by: user.id, status_reason: reason })
      .eq('id', memberId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Notify the student
    await supabase
      .from('notifications')
      .insert({ user_id: member.user_id, type: 'class_invite', group_id: classId, actor_id: user.id })
      .select();

    return NextResponse.json({ ok: true, member: updated });
  } catch (err) {
    console.error('[POST /api/classes/[id]/members/[memberId]/reject]', err);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
