import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string; userId: string }> };

export const dynamic = 'force-dynamic';

// POST /api/groups/[groupId]/members/[userId]/warn
// Tutor approves and sends a warning to a member.
// AI may have drafted the message but the tutor always submits it explicitly.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { groupId, userId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();

    // Verify tutor owns the group
    const { data: group } = await service
      .from('groups')
      .select('id, name, tutor_id')
      .eq('id', groupId)
      .single();

    if (!group || group.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify member exists in this group
    const { data: member } = await service
      .from('group_members')
      .select('id, status')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    const { message } = await request.json() as { message: string };
    if (!message?.trim()) return NextResponse.json({ error: 'message is required' }, { status: 400 });

    // Write warning record
    const { data: warning, error: warnErr } = await service
      .from('warnings')
      .insert({
        class_member_id: member.id,
        message: message.trim(),
        sent_by_tutor_id: user.id,
      })
      .select()
      .single();

    if (warnErr) throw warnErr;

    // Notify the student
    try {
      await service.from('notifications').insert({
        user_id: userId,
        type: 'booking_cancelled', // closest existing type; extend notifications in a later migration
        title: `Warning from your tutor`,
        message: message.trim().slice(0, 140),
        link: `/student/lessons`,
        group_id: groupId,
      });
    } catch { /* non-critical */ }

    return NextResponse.json({ warning });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/members/[userId]/warn]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
