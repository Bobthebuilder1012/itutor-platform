// GET /api/groups/[groupId]/payments — the class Payments grid.
//
// §7. Students as rows, months as columns, one state per cell. Months work as
// columns because group classes bill monthly; that is the only reason, and it
// is why this shape is not reused for 1:1.
//
// ── ON-TIME vs LATE IS DERIVED, NOT STORED ─────────────────────────────────
// From period_start, paid_at and the class's grace_period_days. Deriving it
// means a change to the grace period is reflected in history rather than
// leaving old rows judged by a rule that no longer applies — and it is the same
// arithmetic lib/utils/paymentCycles.ts already does elsewhere, so the grid and
// the dunning logic cannot disagree about who is late.
//
// ── HELD SEATS ARE SEPARATED OUT ───────────────────────────────────────────
// An unpaid CASH hold occupies a scarce physical seat, so it is returned apart
// from the grid rather than as another purple cell. A cell in a wall of cells
// is exactly where that would be missed, and the cost of missing it is a room
// that looks full while nobody has paid.
//
// ── ATTENDANCE TRAVELS WITH PAYMENT ────────────────────────────────────────
// Each row carries recent attendance, because the decision the grid exists to
// support — keep this student or remove them — rests on both together. A
// payment record alone does not support that judgement.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ groupId: string }> };

/** How many months of columns. A term is three; a year of history is noise. */
const MONTHS_BACK = 6;

/** Attendance sessions summarised per student. */
const ATTENDANCE_WINDOW = 8;

async function requireTutorOfClass(groupId: string) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) } as const;
  }
  const admin = getServiceClient();
  const { data: group } = await admin
    .from('groups')
    .select('id, tutor_id, name, grace_period_days, price_monthly, class_format')
    .eq('id', groupId)
    .maybeSingle();
  if (!group || (group as any).tutor_id !== user.id) {
    return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) } as const;
  }
  return { admin, userId: user.id, group: group as any } as const;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { groupId } = await params;
  const auth = await requireTutorOfClass(groupId);
  if ('error' in auth) return auth.error;
  const { admin, group } = auth;

  const graceDays = Number(group.grace_period_days ?? 7);

  // The columns: this month and the five before it.
  const now = new Date();
  const months: string[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS_BACK - 1), 1));

  // Two select tiers: the cash/waive/void columns arrive in migration 248, and
  // a missing column fails the whole select — which here would empty the grid
  // rather than degrade it.
  const FULL =
    'id, enrollment_id, student_id, amount_ttd, status, type, period_start, period_end, paid_at, created_at, payment_method, waived_at, voided_at';
  const BASE =
    'id, enrollment_id, student_id, amount_ttd, status, type, period_start, period_end, paid_at, created_at';

  let payments: any[] | null = null;
  for (const cols of [FULL, BASE]) {
    const { data, error } = await admin
      .from('subscription_payments')
      .select(cols)
      .eq('group_id', groupId)
      .gte('created_at', since.toISOString());
    if (!error) {
      payments = (data ?? []) as any[];
      break;
    }
    const missing = String(error.code) === '42703' || String(error.code) === 'PGRST204';
    if (!missing) {
      console.error('[payments] read failed:', error.message);
      return NextResponse.json({ error: 'could_not_load' }, { status: 500 });
    }
  }
  if (payments === null) payments = [];

  // The roll — everyone who holds or held a seat, so a student with no payment
  // row still appears rather than silently vanishing from the grid.
  const { data: enrolments } = await admin
    .from('group_enrollments')
    .select('id, student_id, status, seat_type, plan_price_ttd, created_at, pending_payment_expires_at')
    .eq('group_id', groupId);

  const studentIds = Array.from(
    new Set([
      ...((enrolments ?? []) as any[]).map((e) => e.student_id),
      ...payments.map((p) => p.student_id),
    ])
  ).filter(Boolean);

  if (studentIds.length === 0) {
    return NextResponse.json({ months, students: [], heldSeats: [], summary: null });
  }

  const [{ data: profiles }, { data: attendance }] = await Promise.all([
    admin.from('profiles').select('id, full_name, display_name, avatar_url').in('id', studentIds),
    admin
      .from('session_attendance_log')
      .select('student_id, status, joined_at, marked_at')
      .eq('group_id', groupId)
      .in('student_id', studentIds)
      .order('joined_at', { ascending: false })
      .limit(studentIds.length * ATTENDANCE_WINDOW),
  ]);

  const enrolByStudent = new Map<string, any>();
  for (const e of (enrolments ?? []) as any[]) {
    // Keep the newest; a student may have re-enrolled.
    const prev = enrolByStudent.get(e.student_id);
    if (!prev || e.created_at > prev.created_at) enrolByStudent.set(e.student_id, e);
  }

  const attendanceByStudent = new Map<string, { present: number; total: number }>();
  for (const a of (attendance ?? []) as any[]) {
    const cur = attendanceByStudent.get(a.student_id) ?? { present: 0, total: 0 };
    cur.total += 1;
    if (a.status === 'attended' || a.status === 'late') cur.present += 1;
    attendanceByStudent.set(a.student_id, cur);
  }

  const paymentsByStudent = new Map<string, any[]>();
  for (const p of payments) {
    paymentsByStudent.set(p.student_id, [...(paymentsByStudent.get(p.student_id) ?? []), p]);
  }

  const students = ((profiles ?? []) as any[])
    .map((p) => {
      const rows = paymentsByStudent.get(p.id) ?? [];
      const enrol = enrolByStudent.get(p.id) ?? null;

      const cells = months.map((m) => {
        // A payment belongs to the month its PERIOD covers, not the month it
        // was created — a late payment for March is still March's cell.
        const row = rows.find((r) =>
          r.period_start ? monthKey(r.period_start) === m : monthKey(r.created_at) === m
        );
        if (!row) {
          return { month: m, state: 'not_enrolled' as const, amount: null, method: null, id: null };
        }
        if (row.voided_at) {
          return { month: m, state: 'void' as const, amount: row.amount_ttd, method: row.payment_method ?? 'card', id: row.id };
        }
        if (row.waived_at) {
          return { month: m, state: 'waived' as const, amount: row.amount_ttd, method: row.payment_method ?? 'card', id: row.id };
        }
        if (row.status === 'PAID') {
          // Late is judged against the grace period, not against the due date —
          // a payment inside grace is on time by the class's own rules.
          const dueBy = row.period_start
            ? new Date(new Date(row.period_start).getTime() + graceDays * 86_400_000)
            : null;
          const paidAt = row.paid_at ? new Date(row.paid_at) : null;
          const late = dueBy && paidAt ? paidAt > dueBy : false;
          return {
            month: m,
            state: late ? ('paid_late' as const) : ('paid' as const),
            amount: row.amount_ttd,
            method: row.payment_method ?? 'card',
            id: row.id,
          };
        }
        // Unpaid. Overdue once the grace period has run out.
        const dueBy = row.period_start
          ? new Date(new Date(row.period_start).getTime() + graceDays * 86_400_000)
          : null;
        const overdue = dueBy ? new Date() > dueBy : false;
        return {
          month: m,
          state: overdue ? ('overdue' as const) : ('due' as const),
          amount: row.amount_ttd,
          method: row.payment_method ?? 'card',
          id: row.id,
        };
      });

      const att = attendanceByStudent.get(p.id) ?? { present: 0, total: 0 };

      return {
        student_id: p.id,
        name: p.display_name || p.full_name || 'Student',
        avatar_url: p.avatar_url ?? null,
        seat_type: enrol?.seat_type === 'physical' ? 'physical' : 'online',
        enrolment_status: enrol?.status ?? null,
        attendance: att,
        cells,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Held seats, surfaced ABOVE the grid rather than inside it.
  const heldSeats = ((enrolments ?? []) as any[])
    .filter((e) => e.status === 'PENDING_PAYMENT')
    .map((e) => {
      const held = payments.find(
        (p) => p.enrollment_id === e.id && p.status === 'PENDING' && (p.payment_method ?? 'card') === 'cash'
      );
      if (!held) return null;
      const days = Math.floor((Date.now() - new Date(e.created_at).getTime()) / 86_400_000);
      const prof = ((profiles ?? []) as any[]).find((p) => p.id === e.student_id);
      return {
        enrollment_id: e.id,
        payment_id: held.id,
        student_id: e.student_id,
        name: prof?.display_name || prof?.full_name || 'Student',
        seat_type: e.seat_type === 'physical' ? 'physical' : 'online',
        amount: held.amount_ttd,
        days_held: days,
      };
    })
    .filter(Boolean);

  const collected = payments
    .filter((p) => p.status === 'PAID' && !p.voided_at && !p.waived_at)
    .reduce(
      (acc, p) => {
        const m = (p.payment_method ?? 'card') as 'card' | 'cash';
        acc[m] += Number(p.amount_ttd) || 0;
        return acc;
      },
      { card: 0, cash: 0 }
    );

  const outstanding = payments
    .filter((p) => p.status !== 'PAID' && !p.voided_at && !p.waived_at)
    .reduce(
      (acc, p) => {
        const m = (p.payment_method ?? 'card') as 'card' | 'cash';
        acc[m] += Number(p.amount_ttd) || 0;
        return acc;
      },
      { card: 0, cash: 0 }
    );

  return NextResponse.json({
    months,
    students,
    heldSeats,
    summary: { collected, outstanding, graceDays },
  });
}
