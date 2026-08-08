// GET /api/admin/payments/reversible
//
// Group payments (subscriptions and secured spots) whose tutor payout is still
// held by us — ledger status 'owed', 'release_ready' or 'admin_hold'. These are
// the only ones an admin can reverse in our records: once a row is 'released'
// the money has left, and recovering it is a tutor_deductions problem rather
// than a status change.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  const { data: ledger, error } = await admin
    .from('payout_ledger')
    .select('id, subscription_payment_id, tutor_id, amount_ttd, status, created_at')
    .not('subscription_payment_id', 'is', null)
    .in('status', ['owed', 'release_ready', 'admin_hold'])
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!ledger?.length) return NextResponse.json({ payments: [] });

  const paymentIds = Array.from(new Set(ledger.map((r: any) => r.subscription_payment_id)));

  const { data: payments } = await admin
    .from('subscription_payments')
    .select('id, type, status, amount_ttd, tutor_payout_ttd, paid_at, group_id, student_id, enrollment_id')
    .in('id', paymentIds);

  const groupIds = Array.from(new Set((payments ?? []).map((p: any) => p.group_id).filter(Boolean)));
  const studentIds = Array.from(new Set((payments ?? []).map((p: any) => p.student_id).filter(Boolean)));

  const [{ data: groups }, { data: students }] = await Promise.all([
    groupIds.length
      ? admin.from('groups').select('id, name').in('id', groupIds)
      : Promise.resolve({ data: [] as any[] }),
    studentIds.length
      ? admin.from('profiles').select('id, full_name').in('id', studentIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const groupById = new Map((groups ?? []).map((g: any) => [g.id, g.name]));
  const studentById = new Map((students ?? []).map((s: any) => [s.id, s.full_name]));
  const ledgerByPayment = new Map<string, any[]>();
  for (const row of ledger) {
    const list = ledgerByPayment.get(row.subscription_payment_id) ?? [];
    list.push(row);
    ledgerByPayment.set(row.subscription_payment_id, list);
  }

  const result = (payments ?? []).map((p: any) => {
    const rows = ledgerByPayment.get(p.id) ?? [];
    return {
      id: p.id,
      type: p.type,
      payment_status: p.status,
      amount_ttd: Number(p.amount_ttd ?? 0),
      tutor_payout_ttd: Number(p.tutor_payout_ttd ?? 0),
      paid_at: p.paid_at,
      class_name: groupById.get(p.group_id) ?? null,
      student_name: studentById.get(p.student_id) ?? null,
      ledger_statuses: rows.map((r: any) => r.status),
      held_ttd: rows.reduce((s: number, r: any) => s + Number(r.amount_ttd ?? 0), 0),
    };
  });

  return NextResponse.json({ payments: result });
}
