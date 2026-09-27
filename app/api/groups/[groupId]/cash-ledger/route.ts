// /api/groups/[groupId]/cash-ledger — the Cash payments tab.
//
//   GET   cash students × months, each cell paid / missed / open
//   POST  { studentId, month: 'YYYY-MM', mark: 'paid' | 'missed' | 'clear' }
//
// Bookkeeping for the tutor, nothing more: iTutor never touches this money, and
// no mark here moves anyone in or out of the class. The only side effects are
// the platform's commission debt on a PAID month (lib/server/cashLedger.ts,
// migration 249) and activating a legacy PENDING_PAYMENT cash hold once paid.
//
// A month's row is created on its FIRST mark rather than by a cron. Nothing
// generates renewal rows for cash, and waiting on something that never runs
// would leave the tutor with no cell to click.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  currentMonth,
  monthEndIso,
  monthStartIso,
  raiseCashCommission,
  waiveCashCommission,
} from '@/lib/server/cashLedger';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ groupId: string }> };

const MONTHS_BACK = 6;
const LIVE_STATUSES = ['ACTIVE', 'GRACE', 'SUSPENDED', 'PENDING_PAYMENT', 'SECURED'];

async function requireTutor(groupId: string) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) } as const;
  const admin = getServiceClient();
  const { data: group } = await admin.from('groups').select('id, tutor_id').eq('id', groupId).maybeSingle();
  if (!group || (group as any).tutor_id !== user.id) {
    return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) } as const;
  }
  return { admin, userId: user.id } as const;
}

const monthOf = (row: any): string => String(row.period_start ?? row.created_at).slice(0, 7);

export async function GET(_req: NextRequest, { params }: Params) {
  const { groupId } = await params;
  const auth = await requireTutor(groupId);
  if ('error' in auth) return auth.error;
  const { admin } = auth;

  const now = new Date();
  const months: string[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    months.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  }

  const { data: enrolments } = await admin
    .from('group_enrollments')
    .select('id, student_id, status, seat_type, plan_price_ttd, created_at')
    .eq('group_id', groupId)
    .eq('billing_provider', 'cash')
    .in('status', LIVE_STATUSES);

  const enrols = ((enrolments ?? []) as any[]).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  // Newest enrolment per student — a re-join supersedes the old one.
  const byStudent = new Map<string, any>();
  for (const e of enrols) if (!byStudent.has(e.student_id)) byStudent.set(e.student_id, e);

  if (byStudent.size === 0) {
    return NextResponse.json({ months, students: [], summary: { collected: 0, thisMonthOpen: 0, missed: 0 } });
  }

  const enrolIds = Array.from(byStudent.values()).map((e) => e.id);
  const [{ data: payments, error: payErr }, { data: profiles }] = await Promise.all([
    admin
      .from('subscription_payments')
      .select('id, enrollment_id, amount_ttd, status, period_start, created_at, paid_at, missed_at, voided_at, waived_at')
      .in('enrollment_id', enrolIds)
      .eq('payment_method', 'cash'),
    admin.from('profiles').select('id, full_name, display_name, avatar_url').in('id', Array.from(byStudent.keys())),
  ]);
  if (payErr) {
    // 261 unapplied (missed_at absent) or 248 unapplied. Either way the tab
    // cannot be trusted, so it says so rather than showing blanks as "open".
    console.error('[cash-ledger] read failed:', payErr.message);
    return NextResponse.json({ error: 'not_available' }, { status: 503 });
  }

  const thisMonth = currentMonth();
  let collected = 0;
  let thisMonthOpen = 0;
  let missed = 0;

  const students = ((profiles ?? []) as any[])
    .map((p) => {
      const e = byStudent.get(p.id);
      const rows = ((payments ?? []) as any[]).filter((r) => r.enrollment_id === e.id && !r.voided_at);
      const joined = String(e.created_at).slice(0, 7);
      const cells = months.map((m) => {
        if (m < joined) return { month: m, state: 'before' as const, id: null, amount: null };
        const row = rows.find((r) => monthOf(r) === m);
        const amount = Number(row?.amount_ttd ?? e.plan_price_ttd ?? 0);
        if (row?.status === 'PAID' || row?.waived_at) {
          collected += row.waived_at ? 0 : amount;
          return { month: m, state: row.waived_at ? ('waived' as const) : ('paid' as const), id: row.id, amount };
        }
        if (row?.missed_at) {
          missed += 1;
          return { month: m, state: 'missed' as const, id: row.id, amount };
        }
        if (m === thisMonth) thisMonthOpen += 1;
        return { month: m, state: 'open' as const, id: row?.id ?? null, amount };
      });
      return {
        student_id: p.id,
        name: p.display_name || p.full_name || 'Student',
        avatar_url: p.avatar_url ?? null,
        seat_type: e.seat_type === 'online' ? 'online' : 'physical',
        monthly: Number(e.plan_price_ttd ?? 0),
        cells,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ months, students, summary: { collected, thisMonthOpen, missed } });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { groupId } = await params;
  const auth = await requireTutor(groupId);
  if ('error' in auth) return auth.error;
  const { admin, userId } = auth;

  const body = (await req.json().catch(() => ({}))) as { studentId?: string; month?: string; mark?: string };
  const mark = body.mark;
  if (!body.studentId || !body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  if (mark !== 'paid' && mark !== 'missed' && mark !== 'clear') {
    return NextResponse.json({ error: 'unknown_mark' }, { status: 400 });
  }
  // Marking the future paid is a prepayment the tutor can record when it
  // happens; marking it missed is a guess. Refused rather than second-guessed.
  if (mark === 'missed' && body.month > currentMonth()) {
    return NextResponse.json({ error: 'A month that has not started cannot be missed.' }, { status: 400 });
  }

  const { data: enrolRows } = await admin
    .from('group_enrollments')
    .select('id, status, plan_price_ttd, created_at')
    .eq('group_id', groupId)
    .eq('student_id', body.studentId)
    .eq('billing_provider', 'cash')
    .in('status', LIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1);
  const enrol = ((enrolRows ?? []) as any[])[0];
  if (!enrol) return NextResponse.json({ error: 'This student does not pay this class in cash.' }, { status: 404 });

  const { data: existingRows, error: readErr } = await admin
    .from('subscription_payments')
    .select('id, status, amount_ttd, period_start, created_at, voided_at, missed_at')
    .eq('enrollment_id', enrol.id)
    .eq('payment_method', 'cash')
    .is('voided_at', null);
  if (readErr) {
    console.error('[cash-ledger] read failed:', readErr.message);
    return NextResponse.json({ error: 'not_available' }, { status: 503 });
  }
  const rows = (existingRows ?? []) as any[];
  let row = rows.find((r) => monthOf(r) === body.month) ?? null;

  if (!row) {
    if (mark === 'clear') return NextResponse.json({ ok: true });
    const { data: created, error: insErr } = await admin
      .from('subscription_payments')
      .insert({
        enrollment_id: enrol.id,
        group_id: groupId,
        student_id: body.studentId,
        type: rows.length === 0 ? 'subscription_initial' : 'subscription_renewal',
        amount_ttd: Number(enrol.plan_price_ttd ?? 0),
        status: 'PENDING',
        payment_method: 'cash',
        period_start: monthStartIso(body.month),
        period_end: monthEndIso(body.month),
      })
      .select('id, status, amount_ttd')
      .single();
    if (insErr || !created) {
      console.error('[cash-ledger] row insert failed:', insErr?.message);
      return NextResponse.json({ error: 'could_not_save' }, { status: 500 });
    }
    row = created;
  }

  const wasPaid = row.status === 'PAID';
  const nowIso = new Date().toISOString();

  if (mark === 'paid') {
    if (wasPaid) return NextResponse.json({ ok: true });
    const { error } = await admin
      .from('subscription_payments')
      .update({ status: 'PAID', paid_at: nowIso, recorded_by: userId, missed_at: null, missed_by: null })
      .eq('id', row.id);
    if (error) {
      console.error('[cash-ledger] mark paid failed:', error.message);
      return NextResponse.json({ error: 'could_not_save' }, { status: 500 });
    }
    await raiseCashCommission(admin, {
      tutorId: userId,
      paymentId: row.id,
      enrollmentId: enrol.id,
      amountTtd: Number(row.amount_ttd) || 0,
    });
    // A legacy instant cash hold becomes a real seat once paid.
    await admin
      .from('group_enrollments')
      .update({ status: 'ACTIVE', payment_status: 'PAID' })
      .eq('id', enrol.id)
      .eq('status', 'PENDING_PAYMENT');
    return NextResponse.json({ ok: true });
  }

  // missed or clear — both say the money is not in hand.
  const { error } = await admin
    .from('subscription_payments')
    .update({
      status: 'PENDING',
      paid_at: null,
      recorded_by: null,
      missed_at: mark === 'missed' ? nowIso : null,
      missed_by: mark === 'missed' ? userId : null,
    })
    .eq('id', row.id);
  if (error) {
    console.error('[cash-ledger] mark failed:', error.message);
    return NextResponse.json({ error: 'could_not_save' }, { status: 500 });
  }
  if (wasPaid) await waiveCashCommission(admin, row.id);
  return NextResponse.json({ ok: true });
}
