// GET /api/admin/enrollments?page=1
//
// Student enrolments into classes, newest first, 50 per page. Unfinished
// checkouts (PENDING_PAYMENT) are not enrolments and are left out.
//
// amount_paid_ttd is what the student was charged to enrol: their first paid
// payment on the enrolment (base + processing fee). A cash enrolment has no
// online payment, so it is reported as cash rather than as free.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const admin = getServiceClient();

  const { data: rows, count, error } = await admin
    .from('group_enrollments')
    .select(
      `id, enrolled_at, status,
       student:profiles!student_id(full_name, display_name),
       group:groups!group_id(name, tutor:profiles!tutor_id(full_name, display_name))`,
      { count: 'exact' }
    )
    .neq('status', 'PENDING_PAYMENT')
    .order('enrolled_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (rows ?? []).map((r: any) => r.id);
  const [{ data: payments }, { data: cash }] = ids.length
    ? await Promise.all([
        admin
          .from('subscription_payments')
          .select('enrollment_id, amount_ttd, charged_processing_fee_ttd, paid_at')
          .in('enrollment_id', ids)
          .in('status', ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'])
          .not('paid_at', 'is', null)
          .order('paid_at', { ascending: true }),
        admin
          .from('cash_join_requests')
          .select('enrollment_id')
          .in('enrollment_id', ids)
          .eq('status', 'approved'),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];

  // Ordered oldest first, so the first one seen per enrolment is what it cost to join.
  const firstPayment = new Map<string, any>();
  for (const p of payments ?? []) {
    if (!firstPayment.has(p.enrollment_id)) firstPayment.set(p.enrollment_id, p);
  }
  const cashIds = new Set((cash ?? []).map((c: any) => c.enrollment_id));

  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

  const enrollments = (rows ?? []).map((r: any) => {
    const student = one(r.student) as any;
    const group = one(r.group) as any;
    const tutor = one(group?.tutor) as any;
    const pay = firstPayment.get(r.id);
    return {
      id: r.id,
      enrolled_at: r.enrolled_at,
      student_name: student?.full_name ?? student?.display_name ?? null,
      class_name: group?.name ?? null,
      tutor_name: tutor?.full_name ?? tutor?.display_name ?? null,
      amount_paid_ttd: pay
        ? Math.round((Number(pay.amount_ttd ?? 0) + Number(pay.charged_processing_fee_ttd ?? 0)) * 100) / 100
        : null,
      payment_method: pay ? 'online' : cashIds.has(r.id) ? 'cash' : 'free',
    };
  });

  return NextResponse.json({
    enrollments,
    page,
    page_size: PAGE_SIZE,
    total: count ?? 0,
  });
}
