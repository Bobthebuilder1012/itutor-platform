// GET /api/groups/[groupId]/cash-requests — the tutor's pending cash requests.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ groupId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { groupId } = await params;
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const admin = getServiceClient();
  const { data: group } = await admin
    .from('groups')
    .select('id, tutor_id, price_monthly, price_online_ttd, price_physical_ttd')
    .eq('id', groupId)
    .maybeSingle();
  if (!group || (group as any).tutor_id !== user.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const g = group as any;

  const { data: rows, error } = await admin
    .from('cash_join_requests')
    .select('id, student_id, seat_type, note, created_at')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  // 261 unapplied: nothing can be pending.
  if (error) return NextResponse.json({ requests: [] });

  const ids = ((rows ?? []) as any[]).map((r) => r.student_id);
  const { data: profiles } = ids.length
    ? await admin.from('profiles').select('id, full_name, display_name, avatar_url').in('id', ids)
    : { data: [] as any[] };
  const byId = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]));

  const requests = ((rows ?? []) as any[]).map((r) => {
    const p = byId.get(r.student_id);
    const price =
      r.seat_type === 'physical'
        ? (g.price_physical_ttd ?? g.price_monthly ?? 0)
        : (g.price_online_ttd ?? g.price_monthly ?? 0);
    return {
      id: r.id,
      student_id: r.student_id,
      name: p?.display_name || p?.full_name || 'Student',
      avatar_url: p?.avatar_url ?? null,
      seat_type: r.seat_type,
      note: r.note,
      amount: Number(price) || 0,
      created_at: r.created_at,
    };
  });

  return NextResponse.json({ requests });
}
