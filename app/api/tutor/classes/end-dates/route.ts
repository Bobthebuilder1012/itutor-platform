// =====================================================
// CLASS END-DATE BACKFILL
// =====================================================
// GET  — classes owned by the caller that still have no end date.
// PATCH— save end dates for several classes at once.
//
// Classes created before migration 200 have end_date IS NULL. Every new
// class is required to have one ("ongoing / no end date" is not an
// allowed class type), so these have to be filled in before the tutor
// can manage classes or payouts. The gate that enforces that reads this
// endpoint — see components/tutor/EndDateGate.tsx.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_CLASS_YEARS = 2;

function todayUtc(): Date {
  return new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
}

/** Shared with POST /api/groups — keep the rules identical in both places. */
function validateEndDate(raw: unknown): { value: string } | { error: string } {
  if (!raw) return { error: 'An end date is required' };
  const d = new Date(`${String(raw).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return { error: 'Not a valid date' };

  const today = todayUtc();
  if (d.getTime() < today.getTime()) return { error: 'End date cannot be in the past' };

  const max = new Date(today);
  max.setUTCFullYear(max.getUTCFullYear() + MAX_CLASS_YEARS);
  if (d.getTime() > max.getTime()) {
    return { error: `End date cannot be more than ${MAX_CLASS_YEARS} years away` };
  }
  return { value: d.toISOString().slice(0, 10) };
}

export async function GET() {
  try {
    const supabase = await getServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const { data, error } = await service
      .from('groups')
      .select('id, name, subject, created_at, price_monthly, pricing_model')
      .eq('tutor_id', user.id)
      .is('end_date', null)
      .is('archived_at', null)
      .order('created_at', { ascending: true });

    if (error) {
      // If end_date hasn't been migrated into this database yet, there is
      // nothing to backfill — don't strand the tutor behind a broken gate.
      const code = String((error as any).code ?? '');
      if (code === '42703' || code.startsWith('PGRST')) {
        return NextResponse.json({ classes: [], pending: 0, unavailable: true });
      }
      throw error;
    }

    return NextResponse.json({ classes: data ?? [], pending: (data ?? []).length });
  } catch (err) {
    console.error('[tutor/classes/end-dates GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await getServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      updates?: Array<{ id: string; end_date: string }>;
    };
    const updates = body.updates ?? [];
    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates supplied' }, { status: 400 });
    }

    const service = getServiceClient();

    // Ownership check up front — never trust the ids in the payload.
    const ids = updates.map((u) => u.id);
    const { data: owned } = await service
      .from('groups')
      .select('id')
      .eq('tutor_id', user.id)
      .in('id', ids);
    const ownedIds = new Set((owned ?? []).map((g: { id: string }) => g.id));

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const u of updates) {
      if (!ownedIds.has(u.id)) {
        results.push({ id: u.id, ok: false, error: 'Not your class' });
        continue;
      }
      const v = validateEndDate(u.end_date);
      if ('error' in v) {
        results.push({ id: u.id, ok: false, error: v.error });
        continue;
      }

      const { error } = await service
        .from('groups')
        .update({ end_date: v.value })
        .eq('id', u.id)
        .eq('tutor_id', user.id);

      if (error) {
        results.push({ id: u.id, ok: false, error: error.message });
      } else {
        results.push({ id: u.id, ok: true });
      }
    }

    // NOTE — NOT YET IMPLEMENTED: applying the new end date to enrollments
    // that are already ACTIVE on these classes. Because we own the billing
    // cycle (rather than using Stripe subscriptions with cancel_at), stopping
    // at end_date is enforced by the cycle logic in process-subscriptions,
    // which does not yet read end_date. Until that lands, a backfilled class
    // with active enrollments will keep billing past its end date.
    const failed = results.filter((r) => !r.ok);
    const { count } = await service
      .from('groups')
      .select('id', { count: 'exact', head: true })
      .eq('tutor_id', user.id)
      .is('end_date', null)
      .is('archived_at', null);

    return NextResponse.json({
      updated: results.filter((r) => r.ok).length,
      failed,
      remaining: count ?? 0,
    });
  } catch (err) {
    console.error('[tutor/classes/end-dates PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
