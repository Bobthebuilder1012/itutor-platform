import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// DELETE /api/classes/[id] — soft-delete via archive_class RPC
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id: classId } = await params;
    const supabase = await getServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const reason: string | null = body.reason ?? null;
    const force: boolean = body.force === true;

    // When force=true, cancel all future occurrences so archive_class passes
    if (force) {
      const { getServiceClient } = await import('@/lib/supabase/server');
      const admin = getServiceClient();
      const now = new Date().toISOString();
      await admin
        .from('group_session_occurrences')
        .update({ status: 'cancelled' })
        .eq('group_id', classId)
        .gt('scheduled_start_at', now)
        .neq('status', 'cancelled');
    }

    const { data, error } = await supabase.rpc('archive_class', {
      p_group_id: classId,
      p_actor_id: user.id,
      p_reason: reason,
    });

    if (error) throw error;

    // archive_class returns JSONB — normalise across possible shapes:
    // { status, count? } | [{ status, count? }] | "ok" | null (null = success on some DB versions)
    const raw = Array.isArray(data) ? data[0] : data;
    let result: { status?: string; count?: number; message?: string } = {};
    if (raw === null || raw === undefined) {
      result = { status: 'ok' };
    } else if (typeof raw === 'string') {
      result = { status: raw };
    } else if (typeof raw === 'object') {
      result = raw as typeof result;
    }

    console.log('[DELETE /api/classes/[id]] archive_class raw:', JSON.stringify(data), 'normalised:', result);

    const status = result.status ?? 'ok';

    if (status === 'ok') {
      return NextResponse.json({ ok: true });
    }
    if (status === 'class_not_found') {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    if (status === 'already_archived') {
      return NextResponse.json({ ok: false, error: 'already_archived' }, { status: 410 });
    }
    if (status === 'not_owner') {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }
    if (status === 'has_future_sessions') {
      return NextResponse.json(
        { ok: false, error: 'has_future_sessions', count: result.count ?? 0, message: `You have ${result.count ?? 'upcoming'} upcoming sessions. Cancel them first.` },
        { status: 409 },
      );
    }
    if (status === 'has_unpaid_dues') {
      return NextResponse.json(
        { ok: false, error: 'has_unpaid_dues', count: result.count ?? 0, message: `You have ${result.count ?? 'outstanding'} outstanding payments. Resolve them first.` },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: false, error: status }, { status: 422 });
  } catch (err) {
    console.error('[DELETE /api/classes/[id]]', err);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
