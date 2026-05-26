// =====================================================
// LIST PENDING PAYOUTS (ADMIN)
// =====================================================
// GET /api/admin/payouts/pending
// Returns the full tutor-payout pipeline grouped by tutor:
//   - tutors           — release_ready rows NOT yet attached to a batch
//                        (ready to add to the next CSV)
//   - escrow_tutors    — owed rows (in escrow; release after the
//                        7-day window) so admins can see what's
//                        coming next, mirroring the tutor wallet hero.
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

function buildGroup(
  ledgerRows: any[],
  profileById: Map<string, any>,
  accountByTutor: Map<string, any>
): PendingTutor[] {
  const grouped = new Map<string, PendingTutor>();
  for (const row of ledgerRows) {
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
  return Array.from(grouped.values()).sort((a, b) => b.total_ttd - a.total_ttd);
}

export async function GET() {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  const [{ data: ready, error: readyErr }, { data: escrow, error: escrowErr }] = await Promise.all([
    admin
      .from('payout_ledger')
      .select('id, tutor_id, amount_ttd, status, created_at')
      .eq('status', 'release_ready')
      .is('batch_id', null),
    admin
      .from('payout_ledger')
      .select('id, tutor_id, amount_ttd, status, created_at')
      .eq('status', 'owed'),
  ]);

  if (readyErr) return NextResponse.json({ error: readyErr.message }, { status: 500 });
  if (escrowErr) return NextResponse.json({ error: escrowErr.message }, { status: 500 });

  const readyRows = ready ?? [];
  const escrowRows = escrow ?? [];

  const allTutorIds = Array.from(
    new Set(
      [...readyRows, ...escrowRows]
        .map((row: any) => row.tutor_id)
        .filter(Boolean)
    )
  );

  if (allTutorIds.length === 0) {
    return NextResponse.json({
      tutors: [],
      total_amount_ttd: 0,
      line_count: 0,
      escrow_tutors: [],
      escrow_total_amount_ttd: 0,
      escrow_line_count: 0,
    });
  }

  const [{ data: profiles }, { data: accounts }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email').in('id', allTutorIds),
    admin
      .from('tutor_payout_accounts')
      .select('tutor_id, payout_name, payout_account_identifier, bank_name, branch, account_type')
      .in('tutor_id', allTutorIds),
  ]);

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const accountByTutor = new Map((accounts ?? []).map((a: any) => [a.tutor_id, a]));

  const tutors = buildGroup(readyRows, profileById, accountByTutor);
  const escrowTutors = buildGroup(escrowRows, profileById, accountByTutor);

  return NextResponse.json({
    tutors,
    total_amount_ttd: Math.round(tutors.reduce((s, t) => s + t.total_ttd, 0) * 100) / 100,
    line_count: readyRows.length,
    escrow_tutors: escrowTutors,
    escrow_total_amount_ttd:
      Math.round(escrowTutors.reduce((s, t) => s + t.total_ttd, 0) * 100) / 100,
    escrow_line_count: escrowRows.length,
  });
}
