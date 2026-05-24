import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string; discountId: string }> };

export const dynamic = 'force-dynamic';

async function assertTutorOwns(groupId: string, userId: string) {
  const service = getServiceClient();
  const { data } = await service.from('groups').select('tutor_id').eq('id', groupId).single();
  return data?.tutor_id === userId;
}

// PATCH /api/groups/[groupId]/discounts/[discountId] — edit or deactivate
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { groupId, discountId } = await params;
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await assertTutorOwns(groupId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const allowed = ['type', 'value', 'value_type', 'ends_at', 'starts_at', 'condition', 'active'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }
    updates.updated_at = new Date().toISOString();

    const service = getServiceClient();
    const { data, error } = await service
      .from('discounts')
      .update(updates)
      .eq('id', discountId)
      .eq('class_id', groupId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ discount: data });
  } catch (err) {
    console.error('[PATCH /discounts/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/groups/[groupId]/discounts/[discountId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { groupId, discountId } = await params;
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await assertTutorOwns(groupId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const service = getServiceClient();
    const { error } = await service
      .from('discounts')
      .delete()
      .eq('id', discountId)
      .eq('class_id', groupId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /discounts/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
