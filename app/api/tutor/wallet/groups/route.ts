// GET /api/tutor/wallet/groups
// Financial overview for the Group Tracker tab.
// Returns per-group data: subscriber counts, monthly earned, projected,
// pending (unpaid), waiting-for-payout, and per-subscriber payment status.

import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const userClient = await getServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await userClient
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'tutor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = getServiceClient();

  const { data: groups } = await admin
    .from('groups')
    .select('id, name, subject_id, max_students, price_monthly, status')
    .eq('tutor_id', user.id)
    .not('status', 'eq', 'ARCHIVED')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (!groups || groups.length === 0) return NextResponse.json({ groups: [] });

  const groupIds = groups.map((g: any) => g.id);

  // Subject names
  const subjectIds = [...new Set(groups.map((g: any) => g.subject_id).filter(Boolean))];
  const { data: subjects } = subjectIds.length
    ? await admin.from('subjects').select('id, name, label').in('id', subjectIds as string[])
    : { data: [] as any[] };
  const subjectById = new Map((subjects ?? []).map((s: any) => [s.id, s]));

  // All non-cancelled enrollments for these groups
  const { data: enrollments } = await admin
    .from('group_enrollments')
    .select('id, group_id, student_id, status, payment_status, plan_price_ttd, last_paid_at, current_period_start, current_period_end, next_payment_due_at, cancel_at_period_end, pending_payment_expires_at')
    .in('group_id', groupIds)
    .eq('enrollment_type', 'SUBSCRIPTION')
    .not('status', 'eq', 'CANCELLED')
    .order('enrolled_at', { ascending: true });

  const studentIds = [...new Set((enrollments ?? []).map((e: any) => e.student_id).filter(Boolean))];
  const { data: students } = studentIds.length
    ? await admin.from('profiles').select('id, full_name, display_name, avatar_url').in('id', studentIds as string[])
    : { data: [] as any[] };
  const studentById = new Map((students ?? []).map((p: any) => [p.id, p]));

  // Current month boundaries
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  // All PAID subscription payments (last 13 months for history + current month check)
  const thirteenMonthsAgo = new Date();
  thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

  const { data: payments } = await admin
    .from('subscription_payments')
    .select('id, enrollment_id, group_id, tutor_payout_ttd, amount_ttd, period_start, paid_at, created_at')
    .in('group_id', groupIds)
    .eq('status', 'PAID')
    .gte('created_at', thirteenMonthsAgo.toISOString());

  // Payout ledger — subscription rows in escrow or release_ready (waiting for payout)
  const allPaymentIds = (payments ?? []).map((p: any) => p.id).filter(Boolean);
  const { data: ledgerRows } = allPaymentIds.length
    ? await admin
        .from('payout_ledger')
        .select('subscription_payment_id, amount_ttd, status')
        .in('subscription_payment_id', allPaymentIds)
        .in('status', ['owed', 'release_ready'])
    : { data: [] as any[] };

  // Map payment_id → group_id
  const paymentGroupMap = new Map<string, string>();
  for (const p of payments ?? []) {
    if (p.id && p.group_id) paymentGroupMap.set(p.id, p.group_id);
  }

  // Aggregate ledger waiting-for-payout by group
  const waitingByGroup = new Map<string, number>();
  for (const row of ledgerRows ?? []) {
    const groupId = paymentGroupMap.get(row.subscription_payment_id);
    if (groupId) {
      waitingByGroup.set(groupId, (waitingByGroup.get(groupId) ?? 0) + Number(row.amount_ttd ?? 0));
    }
  }

  // Build per-group payment aggregations
  const totalEarnedByGroup = new Map<string, number>();
  const earnedThisMonthByGroup = new Map<string, number>();
  const paidThisMonthEnrollments = new Map<string, Set<string>>(); // groupId → Set<enrollmentId>
  const paidPeriodsByEnrollment = new Map<string, { month: number; year: number }[]>();
  const paidThisMonthByEnrollment = new Set<string>();

  for (const p of payments ?? []) {
    // Lifetime earned
    if (p.group_id) {
      totalEarnedByGroup.set(p.group_id, (totalEarnedByGroup.get(p.group_id) ?? 0) + Number(p.tutor_payout_ttd ?? 0));
    }

    // Paid period tracking per enrollment (for history grid)
    const d = p.period_start ? new Date(p.period_start) : p.paid_at ? new Date(p.paid_at) : null;
    if (d && p.enrollment_id) {
      if (!paidPeriodsByEnrollment.has(p.enrollment_id)) paidPeriodsByEnrollment.set(p.enrollment_id, []);
      paidPeriodsByEnrollment.get(p.enrollment_id)!.push({ month: d.getMonth(), year: d.getFullYear() });
    }

    // This-month earned
    const paidAt = p.paid_at ?? p.created_at;
    if (paidAt && paidAt >= monthStart && paidAt < monthEnd && p.group_id) {
      earnedThisMonthByGroup.set(p.group_id, (earnedThisMonthByGroup.get(p.group_id) ?? 0) + Number(p.tutor_payout_ttd ?? 0));
      if (p.enrollment_id) {
        if (!paidThisMonthEnrollments.has(p.group_id)) paidThisMonthEnrollments.set(p.group_id, new Set());
        paidThisMonthEnrollments.get(p.group_id)!.add(p.enrollment_id);
        paidThisMonthByEnrollment.add(p.enrollment_id);
      }
    }
  }

  // Group enrollments by group
  const enrollmentsByGroup = new Map<string, any[]>();
  for (const e of enrollments ?? []) {
    if (!enrollmentsByGroup.has(e.group_id)) enrollmentsByGroup.set(e.group_id, []);
    enrollmentsByGroup.get(e.group_id)!.push(e);
  }

  const nowIso = now.toISOString();

  const result = groups.map((g: any) => {
    const subject = g.subject_id ? subjectById.get(g.subject_id) : null;
    const groupEnrollments = enrollmentsByGroup.get(g.id) ?? [];

    // Active = ACTIVE + GRACE (still have access); SUSPENDED keeps seat
    const activeCount = groupEnrollments.filter(
      (e: any) => ['ACTIVE', 'GRACE', 'SUSPENDED'].includes(e.status)
    ).length;

    // Pending = GRACE (overdue) + PENDING_PAYMENT (not expired)
    const pendingCount = groupEnrollments.filter((e: any) => {
      if (e.status === 'GRACE') return true;
      if (e.status === 'PENDING_PAYMENT') {
        return !e.pending_payment_expires_at || e.pending_payment_expires_at > nowIso;
      }
      return false;
    }).length;

    // Projected = sum of plan_price_ttd for ACTIVE enrollments (expected monthly revenue)
    const projectedThisMonth = groupEnrollments
      .filter((e: any) => e.status === 'ACTIVE')
      .reduce((sum: number, e: any) => sum + Number(e.plan_price_ttd ?? g.price_monthly ?? 0), 0);

    const subscribers = groupEnrollments.map((e: any) => {
      const student = studentById.get(e.student_id);
      return {
        enrollment_id: e.id,
        student_id: e.student_id,
        student_name: student?.display_name ?? student?.full_name ?? null,
        student_avatar_url: student?.avatar_url ?? null,
        status: e.status as string,
        payment_status: e.payment_status as string,
        plan_price_ttd: e.plan_price_ttd != null ? Number(e.plan_price_ttd) : null,
        last_paid_at: e.last_paid_at ?? null,
        current_period_end: e.current_period_end ?? null,
        next_payment_due_at: e.next_payment_due_at ?? null,
        cancel_at_period_end: e.cancel_at_period_end ?? false,
        paid_this_month: paidThisMonthByEnrollment.has(e.id),
        paid_periods: paidPeriodsByEnrollment.get(e.id) ?? [],
      };
    });

    return {
      id: g.id,
      name: g.name as string,
      subject_name: (subject?.label ?? subject?.name ?? null) as string | null,
      max_students: g.max_students != null ? Number(g.max_students) : null,
      price_monthly: g.price_monthly != null ? Number(g.price_monthly) : null,
      status: g.status as string,
      active_count: activeCount,
      pending_count: pendingCount,
      paid_this_month_count: paidThisMonthEnrollments.get(g.id)?.size ?? 0,
      total_earned_ttd: Math.round((totalEarnedByGroup.get(g.id) ?? 0) * 100) / 100,
      earned_this_month_ttd: Math.round((earnedThisMonthByGroup.get(g.id) ?? 0) * 100) / 100,
      projected_this_month_ttd: Math.round(projectedThisMonth * 100) / 100,
      waiting_for_payout_ttd: Math.round((waitingByGroup.get(g.id) ?? 0) * 100) / 100,
      subscribers,
    };
  });

  return NextResponse.json({ groups: result });
}
