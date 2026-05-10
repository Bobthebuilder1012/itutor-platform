import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    // Get the student's group memberships
    const { data: memberships, error: memberErr } = await service
      .from('group_members')
      .select('group_id, status')
      .eq('user_id', user.id)
      .in('status', ['approved', 'pending']);

    if (memberErr) throw memberErr;

    const groupIds = (memberships || []).map((m: any) => m.group_id).filter(Boolean);
    if (groupIds.length === 0) return NextResponse.json({ groups: [] });

    // Fetch group details
    const { data: groups, error: groupErr } = await service
      .from('groups')
      .select('id, name, subject, tutor_id, tutor:profiles!groups_tutor_id_fkey(full_name, display_name)')
      .in('id', groupIds)
      .is('archived_at', null);

    if (groupErr) {
      // Fallback without tutor join if schema differs
      const { data: bare } = await service
        .from('groups')
        .select('id, name, subject, tutor_id')
        .in('id', groupIds)
        .is('archived_at', null);
      return NextResponse.json({ groups: bare ?? [] });
    }

    return NextResponse.json({ groups: groups ?? [] });
  } catch (err) {
    console.error('[GET /api/student/my-groups]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
