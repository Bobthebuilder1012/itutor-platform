// =====================================================
// LIST PENDING PAYOUTS (ADMIN)
// =====================================================
// GET /api/admin/payouts/pending
// Returns all release_ready ledger items NOT yet attached to a
// batch, grouped by tutor with their bank-account info inlined.
// =====================================================

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PendingTutor {
  tutor_id: string;
  tutor_name: string | null;
  tutor_email: string | null;
  total_ttd: number;
  line_count: number;
  has_payout_account: boolean;
  payout_name: string | null;
  account_number: string | null;
  bank_name: string | null;
  branch: string | null;
  account_type: string | null;
}

export async function GET() {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  const { data: ledger, error } = await admin
    .from('payout_ledger')
    .select('id, tutor_id, amount_ttd, status')
    .eq('status', 'release_ready')
    .is('batch_id', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!ledger || ledger.length === 0) {
    return NextResponse.json({ tutors: [], total_amount_ttd: 0, line_count: 0 });
  }

  const tutorIds = Array.from(new Set(ledger.map((row: any) => row.tutor_id)));

  const [{ data: profiles }, { data: accounts }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email').in('id', tutorIds),
    admin
      .from('tutor_payout_accounts')
      .select('tutor_id, payout_name, payout_account_identifier, bank_name, branch, account_type')
      .in('tutor_id', tutorIds),
  ]);

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const accountByTutor = new Map((accounts ?? []).map((a: any) => [a.tutor_id, a]));

  const grouped = new Map<string, PendingTutor>();
  for (const row of ledger as any[]) {
    const profile = profileById.get(row.tutor_id);
    const account = accountByTutor.get(row.tutor_id);
    const existing = grouped.get(row.tutor_id);
    if (existing) {
      existing.total_ttd += Number(row.amount_ttd);
      existing.line_count += 1;
    } else {
      grouped.set(row.tutor_id, {
        tutor_id: row.tutor_id,
        tutor_name: profile?.full_name ?? null,
        tutor_email: profile?.email ?? null,
        total_ttd: Number(row.amount_ttd),
        line_count: 1,
        has_payout_account: !!account?.payout_account_identifier,
        payout_name: account?.payout_name ?? null,
        account_number: account?.payout_account_identifier ?? null,
        bank_name: account?.bank_name ?? null,
        branch: account?.branch ?? null,
        account_type: account?.account_type ?? null,
      });
    }
  }

  const tutors = Array.from(grouped.values()).sort((a, b) => b.total_ttd - a.total_ttd);
  const totalAmount = tutors.reduce((sum, t) => sum + t.total_ttd, 0);

  return NextResponse.json({
    tutors,
    total_amount_ttd: Math.round(totalAmount * 100) / 100,
    line_count: ledger.length,
  });
}
