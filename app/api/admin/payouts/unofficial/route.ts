// GET /api/admin/payouts/unofficial
//
// Returns a per-tutor payout summary for unbatched release_ready + owed
// payout_ledger rows, with any pending tutor_deductions subtracted.
// Used by the admin Lesson Payments "Unofficial CSV" tab.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  // Unbatched payout_ledger rows (owed + release_ready, not yet in a batch)
  const { data: ledgerRows, error: ledgerErr } = await admin
    .from('payout_ledger')
    .select('id, tutor_id, amount_ttd, status')
    .in('status', ['owed', 'release_ready'])
    .is('batch_id', null);

  if (ledgerErr) {
    return NextResponse.json({ error: ledgerErr.message }, { status: 500 });
  }

  // Pending deductions — SUBSCRIPTION/LESSON only (source_enrollment_id or
  // source_subscription_payment_id set). 1:1 session debts are handled by
  // the One-on-One Payments page and excluded here.
  const { data: deductionRows } = await admin
    .from('tutor_deductions')
    .select('id, tutor_id, amount_ttd, resolved_at')
    .eq('status', 'pending')
    .or('source_enrollment_id.not.is.null,source_subscription_payment_id.not.is.null');

  // Aggregate per tutor
  const grossByTutor = new Map<string, number>();
  for (const r of ledgerRows ?? []) {
    const prev = grossByTutor.get(r.tutor_id) ?? 0;
    grossByTutor.set(r.tutor_id, prev + Number(r.amount_ttd ?? 0));
  }

  const debtByTutor = new Map<string, number>();
  for (const r of deductionRows ?? []) {
    const prev = debtByTutor.get(r.tutor_id) ?? 0;
    debtByTutor.set(r.tutor_id, prev + Number(r.amount_ttd ?? 0));
  }

  // Union all tutor IDs (may have debt even with no pending payout)
  const allTutorIds = new Set([
    ...Array.from(grossByTutor.keys()),
    ...Array.from(debtByTutor.keys()),
  ]);

  if (allTutorIds.size === 0) {
    return NextResponse.json({ tutors: [], total_gross_ttd: 0, total_debt_ttd: 0, total_net_ttd: 0 });
  }

  const tutorIdArr = Array.from(allTutorIds);

  const [{ data: profiles }, { data: accounts }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email').in('id', tutorIdArr),
    admin
      .from('tutor_payout_accounts')
      .select('tutor_id, payout_name, payout_account_identifier, bank_name, branch, account_type')
      .in('tutor_id', tutorIdArr),
  ]);

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const accountById = new Map((accounts ?? []).map((a: any) => [a.tutor_id, a]));

  const tutors = tutorIdArr.map((tutorId) => {
    const gross = Math.round((grossByTutor.get(tutorId) ?? 0) * 100) / 100;
    const debt  = Math.round((debtByTutor.get(tutorId) ?? 0) * 100) / 100;
    const net   = Math.round(Math.max(0, gross - debt) * 100) / 100;
    const prof  = profileById.get(tutorId);
    const acc   = accountById.get(tutorId);
    return {
      tutor_id:           tutorId,
      tutor_name:         acc?.payout_name ?? prof?.full_name ?? '—',
      email:              prof?.email ?? null,
      bank_name:          acc?.bank_name ?? null,
      branch:             acc?.branch ?? null,
      account_number:     acc?.payout_account_identifier ?? null,
      account_type:       acc?.account_type ?? null,
      gross_payout_ttd:   gross,
      pending_debt_ttd:   debt,
      net_payout_ttd:     net,
    };
  }).sort((a, b) => b.net_payout_ttd - a.net_payout_ttd);

  const total_gross_ttd = Math.round(tutors.reduce((s, t) => s + t.gross_payout_ttd, 0) * 100) / 100;
  const total_debt_ttd  = Math.round(tutors.reduce((s, t) => s + t.pending_debt_ttd, 0) * 100) / 100;
  const total_net_ttd   = Math.round(tutors.reduce((s, t) => s + t.net_payout_ttd, 0) * 100) / 100;

  // Include deduction IDs so the UI can mark them as exported
  const deduction_ids = (deductionRows ?? []).map((d: any) => d.id);

  return NextResponse.json({ tutors, total_gross_ttd, total_debt_ttd, total_net_ttd, deduction_ids });
}
