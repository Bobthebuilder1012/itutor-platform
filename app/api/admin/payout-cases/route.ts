// GET  /api/admin/payout-cases — list cases with filters
// POST /api/admin/payout-cases — create a manual admin hold

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();
  const { searchParams } = new URL(request.url);

  const status      = searchParams.get('status');
  const tutorId     = searchParams.get('tutor_id');
  const holdReason  = searchParams.get('hold_reason');
  const page        = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const pageSize    = Math.min(100, Math.max(1, parseInt(searchParams.get('page_size') ?? '50', 10)));
  const offset      = (page - 1) * pageSize;

  let query = admin
    .from('payout_cases')
    .select(`
      id, hold_reason, status,
      refund_amount_ttd, release_amount_ttd,
      admin_notes, resolved_at, created_at, updated_at,
      payout_ledger:payout_ledger_id(amount_ttd, status, blocked_at),
      tutor:profiles!tutor_id(id, full_name, email),
      claimant:profiles!claimant_id(id, full_name),
      session:sessions!session_id(id, scheduled_start_at),
      noshow_claim:noshow_claims!noshow_claim_id(id, status, admin_verdict)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (status)     query = query.eq('status', status);
  if (tutorId)    query = query.eq('tutor_id', tutorId);
  if (holdReason) query = query.eq('hold_reason', holdReason);

  const { data: cases, error, count } = await query;

  if (error) {
    console.error('[GET /api/admin/payout-cases]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    cases: cases ?? [],
    total: count ?? 0,
    page,
    page_size: pageSize,
  });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

interface ManualHoldBody {
  ledger_id?:                string;
  session_id?:               string;
  subscription_payment_id?:  string;
  payment_id?:               string;
  hold_reason:               string;
  admin_notes?:              string;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as ManualHoldBody;

  if (!body.hold_reason) {
    return NextResponse.json({ error: 'hold_reason is required' }, { status: 400 });
  }
  if (!body.ledger_id && !body.session_id && !body.subscription_payment_id && !body.payment_id) {
    return NextResponse.json(
      { error: 'One of ledger_id, session_id, subscription_payment_id, or payment_id is required' },
      { status: 400 }
    );
  }

  const admin = getServiceClient();

  // ── Path A: ledger_id provided — hold immediately ──────────────────────────
  if (body.ledger_id) {
    const { data: ledger } = await admin
      .from('payout_ledger')
      .select('id, status, tutor_id')
      .eq('id', body.ledger_id)
      .maybeSingle();

    if (!ledger) {
      return NextResponse.json({ error: 'Payout ledger row not found' }, { status: 404 });
    }

    if (ledger.status === 'admin_hold') {
      const { data: existing } = await admin
        .from('payout_cases')
        .select('id')
        .eq('payout_ledger_id', body.ledger_id)
        .in('status', ['open', 'under_review'])
        .maybeSingle();
      return NextResponse.json(
        { error: 'This payout is already under an admin hold', case_id: existing?.id },
        { status: 409 }
      );
    }

    if (ledger.status === 'released') {
      return NextResponse.json(
        {
          error: 'payout_already_released',
          message: 'This payout has already been released and cannot be held. Create a recovery case instead.',
        },
        { status: 422 }
      );
    }

    if (ledger.status === 'reversed') {
      return NextResponse.json(
        { error: 'payout_already_reversed', message: 'This payout has already been reversed.' },
        { status: 422 }
      );
    }

    if (!['owed', 'release_ready'].includes(ledger.status)) {
      return NextResponse.json(
        { error: `Ledger status '${ledger.status}' is not holdable` },
        { status: 422 }
      );
    }

    const { data: result, error: holdError } = await (admin as any).rpc('place_payout_hold', {
      p_ledger_id:   body.ledger_id,
      p_hold_reason: body.hold_reason,
    });

    if (holdError) {
      console.error('[POST /api/admin/payout-cases] place_payout_hold failed:', holdError);
      return NextResponse.json({ error: holdError.message }, { status: 500 });
    }

    if (body.admin_notes && result?.case_id) {
      await admin
        .from('payout_cases')
        .update({ admin_notes: body.admin_notes, updated_at: new Date().toISOString() })
        .eq('id', result.case_id);
    }

    return NextResponse.json({ ok: true, case_id: result?.case_id }, { status: 201 });
  }

  // ── Path B: no ledger yet — create pre-ledger payout_case ─────────────────
  // Derive tutor_id from the provided identifier
  let tutorId: string | null = null;

  if (body.session_id) {
    const { data: sess } = await admin
      .from('sessions')
      .select('tutor_id')
      .eq('id', body.session_id)
      .maybeSingle();
    tutorId = sess?.tutor_id ?? null;
  } else if (body.subscription_payment_id) {
    const { data: sp } = await admin
      .from('subscription_payments')
      .select('tutor_payout_ttd, group:groups!group_id(tutor_id)')
      .eq('id', body.subscription_payment_id)
      .maybeSingle();
    tutorId = (sp?.group as any)?.tutor_id ?? null;
  } else if (body.payment_id) {
    const { data: pay } = await admin
      .from('payments')
      .select('booking:bookings!booking_id(session:sessions(tutor_id))')
      .eq('id', body.payment_id)
      .maybeSingle();
    tutorId = (pay?.booking as any)?.session?.[0]?.tutor_id ?? null;
  }

  if (!tutorId) {
    return NextResponse.json(
      { error: 'Could not derive tutor_id from the provided identifier' },
      { status: 422 }
    );
  }

  const { data: newCase, error: caseErr } = await admin
    .from('payout_cases')
    .insert({
      payout_ledger_id:        null,
      session_id:              body.session_id ?? null,
      subscription_payment_id: body.subscription_payment_id ?? null,
      payment_id:              body.payment_id ?? null,
      tutor_id:                tutorId,
      hold_reason:             body.hold_reason,
      status:                  'open',
      admin_id:                auth.user!.id,
      admin_notes:             body.admin_notes ?? null,
    })
    .select('id')
    .single();

  if (caseErr || !newCase) {
    console.error('[POST /api/admin/payout-cases] pre-ledger case insert failed:', caseErr);
    return NextResponse.json({ error: caseErr?.message ?? 'Failed to create case' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, case_id: newCase.id }, { status: 201 });
}
