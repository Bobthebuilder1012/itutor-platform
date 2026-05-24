import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

export const dynamic = 'force-dynamic';

async function assertTutorOwns(groupId: string, userId: string) {
  const service = getServiceClient();
  const { data } = await service.from('groups').select('tutor_id').eq('id', groupId).single();
  return data?.tutor_id === userId;
}

// GET /api/groups/[groupId]/discounts
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await assertTutorOwns(groupId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const service = getServiceClient();
    const { data, error } = await service
      .from('discounts')
      .select('*')
      .eq('class_id', groupId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ discounts: data ?? [] });
  } catch (err) {
    console.error('[GET /discounts]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups/[groupId]/discounts
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await assertTutorOwns(groupId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { type, value, value_type = 'percent', ends_at = null, starts_at = null, condition = {} } = body;

    if (!['early_bird', 'time_limited', 'open_ended'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
    if (!value || Number(value) <= 0) {
      return NextResponse.json({ error: 'value must be > 0' }, { status: 400 });
    }

    const service = getServiceClient();

    // Deactivate any existing active discount first (DB enforces uniqueness)
    await service
      .from('discounts')
      .update({ active: false })
      .eq('class_id', groupId)
      .eq('active', true);

    const { data, error } = await service
      .from('discounts')
      .insert({
        class_id: groupId,
        type,
        value: Number(value),
        value_type,
        condition,
        active: true,
        starts_at: starts_at || null,
        ends_at: ends_at || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ discount: data }, { status: 201 });
  } catch (err) {
    console.error('[POST /discounts]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
