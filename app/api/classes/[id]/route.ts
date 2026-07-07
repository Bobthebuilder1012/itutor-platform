import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

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

    // RPC may return { error: '...' } instead of { status: '...' } — normalise both shapes
    const status = (result as any).status ?? (result as any).error ?? ((result as any).ok === false ? 'error' : 'ok');

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
      // Auto-cancel future sessions, then retry archive
      try {
        const service = getServiceClient();
        const now = new Date().toISOString();

        // Cancel future occurrences on the occurrence-level table
        const { data: sessionRows } = await service
          .from('group_sessions')
          .select('id')
          .eq('group_id', classId);

        const sessionIds = (sessionRows ?? []).map((s: any) => s.id);
        if (sessionIds.length > 0) {
          await service
            .from('group_session_occurrences')
            .update({ status: 'CANCELLED', cancelled_at: now })
            .in('group_session_id', sessionIds)
            .gt('scheduled_start_at', now);
        }

        // Also end the session series so the RPC sees no future recurrences
        await service
          .from('group_sessions')
          .update({ ends_on: now })
          .eq('group_id', classId);

        // Retry archive
        const { data: retryData, error: retryError } = await supabase.rpc('archive_class', {
          p_group_id: classId,
          p_actor_id: user.id,
          p_reason: reason,
        });
        if (retryError) throw retryError;
        const retryRaw = Array.isArray(retryData) ? retryData[0] : retryData;
        const retryStatus = (retryRaw as any)?.status ?? (retryRaw as any)?.error ?? 'ok';
        if (!retryStatus || retryStatus === 'ok') return NextResponse.json({ ok: true });
        throw new Error(`archive_class retry: ${retryStatus}`);
      } catch (retryErr) {
        console.error('[DELETE /api/classes/[id]] retry after session cancel failed:', retryErr);
        return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
      }
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
