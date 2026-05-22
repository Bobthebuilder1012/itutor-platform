// =====================================================
// EXPORT PAYOUT BATCH (ADMIN)
// =====================================================
// POST /api/admin/payouts/export
//
// 1. Inserts a payout_batches row.
// 2. Atomically claims all release_ready ledger items not yet
//    in a batch — stamps batch_id on them.
// 3. Returns the batch metadata + CSV body.
//
// Tutors without a saved payout account are SKIPPED (their lines
// remain release_ready, so the next export can pick them up after
// they fill in their bank info).
// =====================================================

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CSV_HEADER = ['tutor_id', 'name', 'bank_name', 'branch', 'account_number', 'account_type', 'amount_ttd', 'reference'];

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function POST() {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  // --- Pull eligible ledger items + the tutor accounts in one shot ---
  const { data: ledger, error: ledgerError } = await admin
    .from('payout_ledger')
    .select('id, tutor_id, amount_ttd')
    .eq('status', 'release_ready')
    .is('batch_id', null);

  if (ledgerError) {
    return NextResponse.json({ error: ledgerError.message }, { status: 500 });
  }

  if (!ledger || ledger.length === 0) {
    return NextResponse.json(
      { error: 'No payouts ready to export' },
      { status: 400 }
    );
  }

  const tutorIds = Array.from(new Set(ledger.map((r: any) => r.tutor_id)));
  const [{ data: profiles }, { data: accounts }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email').in('id', tutorIds),
    admin
      .from('tutor_payout_accounts')
      .select('tutor_id, payout_name, payout_account_identifier, bank_name, branch, account_type')
      .in('tutor_id', tutorIds),
  ]);

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const accountByTutor = new Map((accounts ?? []).map((a: any) => [a.tutor_id, a]));

  const eligibleLedgerIds: string[] = [];
  const skipped: Array<{ tutor_id: string; reason: string }> = [];
  const lineByTutor = new Map<string, { amount: number; ledgerIds: string[] }>();

  for (const row of ledger as any[]) {
    const account = accountByTutor.get(row.tutor_id);
    const hasBank =
      !!account?.payout_account_identifier &&
      !!account?.bank_name &&
      !!account?.branch &&
      !!account?.payout_name;

    if (!hasBank) {
      if (!skipped.find((s) => s.tutor_id === row.tutor_id)) {
        skipped.push({ tutor_id: row.tutor_id, reason: 'missing_bank_details' });
      }
      continue;
    }

    eligibleLedgerIds.push(row.id);
    const cur = lineByTutor.get(row.tutor_id);
    if (cur) {
      cur.amount += Number(row.amount_ttd);
      cur.ledgerIds.push(row.id);
    } else {
      lineByTutor.set(row.tutor_id, {
        amount: Number(row.amount_ttd),
        ledgerIds: [row.id],
      });
    }
  }

  if (eligibleLedgerIds.length === 0) {
    return NextResponse.json(
      { error: 'All eligible payouts are missing bank details', skipped },
      { status: 400 }
    );
  }

  const totalAmount = Array.from(lineByTutor.values()).reduce((s, v) => s + v.amount, 0);
  const lineCount = lineByTutor.size;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `itutor-payouts-${ts}.csv`;

  // --- Create the batch row ---
  const { data: batch, error: batchError } = await admin
    .from('payout_batches')
    .insert({
      generated_by: auth.user!.id,
      total_amount_ttd: Math.round(totalAmount * 100) / 100,
      line_count: lineCount,
      status: 'exported',
      csv_filename: filename,
    })
    .select('id, generated_at, total_amount_ttd, line_count, status, csv_filename')
    .single();

  if (batchError || !batch) {
    return NextResponse.json(
      { error: batchError?.message ?? 'Failed to create batch' },
      { status: 500 }
    );
  }

  // --- Stamp the ledger items with the batch id ---
  const { error: stampError } = await admin
    .from('payout_ledger')
    .update({ batch_id: batch.id, updated_at: new Date().toISOString() })
    .in('id', eligibleLedgerIds);

  if (stampError) {
    // Roll back the batch row so the next export attempt isn't poisoned.
    await admin.from('payout_batches').delete().eq('id', batch.id);
    return NextResponse.json({ error: stampError.message }, { status: 500 });
  }

  // --- Build CSV ---
  const rows: string[] = [];
  rows.push(CSV_HEADER.join(','));
  for (const [tutorId, agg] of lineByTutor) {
    const account = accountByTutor.get(tutorId);
    const profile = profileById.get(tutorId);
    rows.push(
      [
        csvCell(tutorId),
        csvCell(account?.payout_name ?? profile?.full_name ?? ''),
        csvCell(account?.bank_name),
        csvCell(account?.branch),
        csvCell(account?.payout_account_identifier),
        csvCell(account?.account_type),
        csvCell((Math.round(agg.amount * 100) / 100).toFixed(2)),
        csvCell(`ITUTOR-${batch.id.slice(0, 8)}`),
      ].join(',')
    );
  }

  const csv = rows.join('\r\n') + '\r\n';

  return NextResponse.json({
    batch,
    csv,
    filename,
    skipped,
  });
}
