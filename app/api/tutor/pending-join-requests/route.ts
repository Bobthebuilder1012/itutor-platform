import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ requests: [] }, { status: 401 });

    const service = getServiceClient();

    // Get tutor's group IDs
    const { data: groups } = await service
      .from('groups')
      .select('id, name')
      .eq('tutor_id', user.id)
      .is('archived_at', null);

    if (!groups?.length) return NextResponse.json({ requests: [] });

    const groupIds = groups.map((g: any) => g.id);
    const groupMap = new Map(groups.map((g: any) => [g.id, g]));

    // Get pending members for those groups
    const { data: pendingMembers } = await service
      .from('group_members')
      .select('id, user_id, group_id, joined_at, profile:profiles!group_members_user_id_fkey(full_name, display_name)')
      .in('group_id', groupIds)
      .eq('status', 'pending');

    const requests = (pendingMembers ?? []).map((m: any) => {
      const p = Array.isArray(m.profile) ? m.profile[0] : m.profile;
      const g = groupMap.get(m.group_id);
      return {
        id: m.id,
        studentId: m.user_id,
        studentName: p?.display_name || p?.full_name || 'Student',
        groupId: m.group_id,
        groupName: g?.name ?? 'a class',
        joinedAt: m.joined_at ?? '',
      };
    });

    return NextResponse.json({ requests });
  } catch (err) {
    console.error('[GET /api/tutor/pending-join-requests]', err);
    return NextResponse.json({ requests: [] });
  }
}
