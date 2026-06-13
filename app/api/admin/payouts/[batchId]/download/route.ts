// =====================================================
// DOWNLOAD PAYOUT BATCH CSV (ADMIN)
// =====================================================
// POST /api/admin/payouts/:batchId/download
//
// The download GATE in the "move, don't sweep" lifecycle. For a batch
// created by the Friday MOVE (status 'pending_download'):
//   1. Builds the bank CSV from the batch's stamped ledger rows.
//   2. RETAINS it server-side (payout_batches.csv_body + csv_generated_at).
//   3. Flips the batch 'pending_download' → 'exported'.
//   4. Returns the CSV body for the browser to download.
//
// Re-downloading an already-exported/paid batch returns the retained
// csv_body without re-generating, so the file is never lost.
//
// mark-paid is gated on csv_generated_at, so a batch can only be
// finalised once this endpoint has actually produced + retained a file.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
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

export async function POST(
  _request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const admin = getServiceClient();

  // ── Load the batch ─────────────────────────────────────────────────────────
  const { data: batch, error: batchErr } = await admin
    .from('payout_batches')
    .select('id, status, csv_body, csv_filename, csv_generated_at')
    .eq('id', params.batchId)
    .maybeSingle();

  if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 });
  if (!batch)   return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

  // ── Already generated → return the retained file (never re-mint) ───────────
  if (batch.csv_generated_at && batch.csv_body) {
    return NextResponse.json({
      ok: true,
      csv: batch.csv_body,
      filename: batch.csv_filename ?? `itutor-payouts-${params.batchId.slice(0, 8)}.csv`,
      regenerated: false,
    });
  }

  if (batch.status === 'cancelled') {
    return NextResponse.json({ error: 'Batch is cancelled' }, { status: 400 });
  }

  // ── Build the CSV from this batch's stamped ledger rows ────────────────────
  const { data: ledger, error: ledgerErr } = await admin
    .from('payout_ledger')
    .select('id, tutor_id, amount_ttd')
    .eq('batch_id', params.batchId);

  if (ledgerErr) return NextResponse.json({ error: ledgerErr.message }, { status: 500 });
  if (!ledger || ledger.length === 0) {
    return NextResponse.json({ error: 'Batch has no ledger rows' }, { status: 400 });
  }

  const tutorIds = Array.from(new Set(ledger.map((r: any) => r.tutor_id)));
  const [{ data: profiles }, { data: accounts }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email').in('id', tutorIds),
    admin
      .from('tutor_payout_accounts')
      .select('tutor_id, payout_name, payout_account_identifier, bank_name, branch, account_type')
      .in('tutor_id', tutorIds),
  ]);

  const profileById    = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const accountByTutor = new Map((accounts ?? []).map((a: any) => [a.tutor_id, a]));

  const amountByTutor = new Map<string, number>();
  for (const row of ledger as any[]) {
    amountByTutor.set(row.tutor_id, (amountByTutor.get(row.tutor_id) ?? 0) + Number(row.amount_ttd));
  }

  const rows: string[] = [CSV_HEADER.join(',')];
  for (const [tutorId, amount] of amountByTutor) {
    const acc = accountByTutor.get(tutorId);
    const pro = profileById.get(tutorId);
    rows.push([
      csvCell(tutorId),
      csvCell(acc?.payout_name ?? pro?.full_name ?? ''),
      csvCell(acc?.bank_name),
      csvCell(acc?.branch),
      csvCell(acc?.payout_account_identifier),
      csvCell(acc?.account_type),
      csvCell((Math.round(amount * 100) / 100).toFixed(2)),
      csvCell(`ITUTOR-${params.batchId.slice(0, 8)}`),
    ].join(','));
  }
  const csv = rows.join('\r\n') + '\r\n';

  // ── Retain server-side + open the download gate (→ exported) ───────────────
  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from('payout_batches')
    .update({
      csv_body:         csv,
      csv_generated_at: now,
      // Only the MOVE-created draft advances; an already-'exported'/'paid'
      // batch keeps its status (handled by the early return above).
      status:           batch.status === 'pending_download' ? 'exported' : batch.status,
    })
    .eq('id', params.batchId);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    csv,
    filename: batch.csv_filename ?? `itutor-payouts-${params.batchId.slice(0, 8)}.csv`,
    regenerated: true,
  });
}
