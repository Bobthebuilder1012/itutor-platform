// GET /api/tutor/wallet/groups
// Returns per-group subscriber data and earnings for the Group Tracker tab.
// Uses service client so member counts are accurate regardless of RLS.

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
    .select('id, name, subject_id, max_students, price_monthly')
    .eq('tutor_id', user.id)
    .not('status', 'eq', 'ARCHIVED')
    .order('created_at', { ascending: false });

  if (!groups || groups.length === 0) return NextResponse.json({ groups: [] });

  const groupIds = groups.map((g: any) => g.id);

  const subjectIds = [...new Set(groups.map((g: any) => g.subject_id).filter(Boolean))];
  const { data: subjects } = subjectIds.length
    ? await admin.from('subjects').select('id, name, label').in('id', subjectIds as string[])
    : { data: [] as any[] };
  const subjectById = new Map((subjects ?? []).map((s: any) => [s.id, s]));

  const { data: enrollments } = await admin
    .from('group_enrollments')
    .select('id, group_id, student_id, status, payment_status, plan_price_ttd, last_paid_at, current_period_end, next_payment_due_at, cancel_at_period_end')
    .in('group_id', groupIds)
    .eq('enrollment_type', 'SUBSCRIPTION')
    .not('status', 'eq', 'CANCELLED')
    .order('enrolled_at', { ascending: true });

  const studentIds = [...new Set((enrollments ?? []).map((e: any) => e.student_id).filter(Boolean))];
  const { data: students } = studentIds.length
    ? await admin.from('profiles').select('id, full_name, display_name, avatar_url').in('id', studentIds as string[])
    : { data: [] as any[] };
  const studentById = new Map((students ?? []).map((p: any) => [p.id, p]));

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const { data: payments } = await admin
    .from('subscription_payments')
    .select('id, enrollment_id, group_id, tutor_payout_ttd, period_start, paid_at')
    .in('group_id', groupIds)
    .eq('status', 'PAID')
    .gte('created_at', twelveMonthsAgo.toISOString());

  const paidPeriodsByEnrollment = new Map<string, { month: number; year: number }[]>();
  const totalEarnedByGroup = new Map<string, number>();

  for (const p of payments ?? []) {
    const d = p.period_start
      ? new Date(p.period_start)
      : p.paid_at
        ? new Date(p.paid_at)
        : null;
    if (d && p.enrollment_id) {
      if (!paidPeriodsByEnrollment.has(p.enrollment_id)) paidPeriodsByEnrollment.set(p.enrollment_id, []);
      paidPeriodsByEnrollment.get(p.enrollment_id)!.push({ month: d.getMonth(), year: d.getFullYear() });
    }
    if (p.group_id) {
      totalEarnedByGroup.set(p.group_id, (totalEarnedByGroup.get(p.group_id) ?? 0) + Number(p.tutor_payout_ttd ?? 0));
    }
  }

  const enrollmentsByGroup = new Map<string, any[]>();
  for (const e of enrollments ?? []) {
    if (!enrollmentsByGroup.has(e.group_id)) enrollmentsByGroup.set(e.group_id, []);
    enrollmentsByGroup.get(e.group_id)!.push(e);
  }

  const result = groups.map((g: any) => {
    const subject = g.subject_id ? subjectById.get(g.subject_id) : null;
    const groupEnrollments = enrollmentsByGroup.get(g.id) ?? [];
    const activeCount = groupEnrollments.filter(
      (e: any) => ['ACTIVE', 'GRACE', 'SUSPENDED'].includes(e.status)
    ).length;

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
        paid_periods: paidPeriodsByEnrollment.get(e.id) ?? [],
      };
    });

    return {
      id: g.id,
      name: g.name as string,
      subject_name: (subject?.label ?? subject?.name ?? null) as string | null,
      max_students: g.max_students != null ? Number(g.max_students) : null,
      price_monthly: g.price_monthly != null ? Number(g.price_monthly) : null,
      active_count: activeCount,
      total_earned_ttd: Math.round((totalEarnedByGroup.get(g.id) ?? 0) * 100) / 100,
      subscribers,
    };
  });

  return NextResponse.json({ groups: result });
}
