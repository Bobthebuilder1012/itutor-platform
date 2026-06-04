import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };
export const dynamic = 'force-dynamic';

// GET /api/groups/[groupId]/promotions
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();
    // Use rpc to bypass PostgREST schema cache (handles newly created tables)
    const { data, error } = await service.rpc('get_group_promotions', { p_group_id: groupId });
    if (!error && data) {
      return NextResponse.json({ promotions: data });
    }

    // Fallback: direct table query
    const { data: rows, error: err2 } = await service
      .from('group_promotions')
      .select('*')
      .eq('group_id', groupId)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (err2) {
      const msg = String(err2?.message ?? '');
      if (msg.includes('does not exist') || msg.includes('schema cache') || (err2 as any)?.code === '42P01') {
        return NextResponse.json({ promotions: [] });
      }
      throw err2;
    }
    return NextResponse.json({ promotions: rows ?? [] });
  } catch (err) {
    console.error('[GET promotions]', err);
    return NextResponse.json({ promotions: [] });
  }
}

// POST /api/groups/[groupId]/promotions
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();
    const { data: group } = await service
      .from('groups').select('tutor_id').eq('id', groupId).single();
    if (!group || group.tutor_id !== user.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { kind, discount, student_cap, duration_days } = body;

    if (!['early-bird', 'time-limited', 'open-ended'].includes(kind))
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
    if (!discount || discount < 1 || discount > 100)
      return NextResponse.json({ error: 'Discount must be 1–100' }, { status: 400 });
    if (kind === 'early-bird' && !student_cap)
      return NextResponse.json({ error: 'student_cap required for early-bird' }, { status: 400 });
    if (kind === 'time-limited' && !duration_days)
      return NextResponse.json({ error: 'duration_days required for time-limited' }, { status: 400 });

    const { data, error } = await service
      .from('group_promotions')
      .insert({
        group_id: groupId,
        tutor_id: user.id,
        kind,
        discount,
        student_cap: kind === 'early-bird' ? student_cap : null,
        duration_days: kind === 'time-limited' ? duration_days : null,
      })
      .select()
      .single();

    if (error) {
      const msg = String(error?.message ?? '');
      const code = (error as any)?.code ?? '';
      console.error('[POST promotions] insert error:', { code, msg, details: (error as any)?.details, hint: (error as any)?.hint });
      return NextResponse.json(
        { error: msg || 'Insert failed', code, details: (error as any)?.details, hint: (error as any)?.hint },
        { status: 500 }
      );
    }
    return NextResponse.json({ promotion: data }, { status: 201 });
  } catch (err) {
    console.error('[POST promotions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/groups/[groupId]/promotions?id=xxx
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const service = getServiceClient();
    const { error } = await service
      .from('group_promotions')
      .update({ active: false })
      .eq('id', id)
      .eq('group_id', groupId)
      .eq('tutor_id', user.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE promotions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
