export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId } = await params;
    const service = getServiceClient();

    const { data: group } = await service.from('groups').select('tutor_id').eq('id', groupId).single();
    if (!group || group.tutor_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const monthsParam = req.nextUrl.searchParams.get('months');
    const monthsBack = monthsParam ? Number.parseInt(monthsParam, 10) : 12;

    const { data: members, error } = await service
      .from('group_members')
      .select('user_id, joined_at, status')
      .eq('group_id', groupId);

    if (error) {
      console.warn('[GET retention]', error.message);
      return NextResponse.json({ data: { months: [] } });
    }

    const approved = (members ?? []).filter((m: any) => m.status === 'approved' && m.joined_at);

    const now = new Date();
    const months: Array<{
      year: number;
      month: number;
      monthLabel: string;
      startCount: number;
      endCount: number;
      changePercent: number | null;
      retentionPercent: number | null;
    }> = [];

    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 1);

      const startCount = approved.filter((m: any) => new Date(m.joined_at) < monthStart).length;
      const endCount = approved.filter((m: any) => new Date(m.joined_at) < monthEnd).length;

      const changePercent = startCount > 0
        ? Number((((endCount - startCount) / startCount) * 100).toFixed(1))
        : startCount === 0 && endCount > 0
          ? 100
          : null;

      const retentionPercent = startCount > 0
        ? Number(((endCount / startCount) * 100).toFixed(1))
        : null;

      const label = monthStart.toLocaleString('en-US', { month: 'short', year: 'numeric' });

      months.push({ year, month: month + 1, monthLabel: label, startCount, endCount, changePercent, retentionPercent });
    }

    return NextResponse.json({ data: { months } });
  } catch (err: any) {
    console.error('[GET retention]', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}
