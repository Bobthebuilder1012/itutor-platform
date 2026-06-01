// POST /api/admin/payouts/create-batch
//
// Creates a payout batch from selected subscription_payment IDs.
// Subscription payout_ledger rows start as 'owed' and do not automatically
// advance through flip_owed_to_release_ready, so this endpoint force-promotes
// the targeted rows to 'release_ready' first, then calls
// create_payout_batch_atomic to stamp them.
//
// Body: { subscription_payment_ids: string[] }

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (err: any) {
    console.error('[POST /api/admin/payouts/create-batch] unhandled error:', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}

async function handlePost(request: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const spIds: string[] = Array.isArray(body?.subscription_payment_ids)
    ? body.subscription_payment_ids
    : [];

  if (spIds.length === 0) {
    return NextResponse.json(
      { error: 'subscription_payment_ids must be a non-empty array' },
      { status: 400 }
    );
  }
  if (spIds.length > 200) {
    return NextResponse.json({ error: 'Maximum 200 IDs per batch' }, { status: 400 });
  }

  const admin = getServiceClient();

  // ── Load payout_ledger rows for the selected subscription payments ────────
  const { data: ledgerRows, error: ledgerErr } = await admin
    .from('payout_ledger')
    .select('id, status, amount_ttd, tutor_id, batch_id')
    .in('subscription_payment_id', spIds)
    .not('status', 'in', '(reversed,admin_hold,released)');

  if (ledgerErr) {
    return NextResponse.json({ error: ledgerErr.message }, { status: 500 });
  }

  const rows = (ledgerRows ?? []) as Array<{
    id: string;
    status: string;
    amount_ttd: string | number;
    tutor_id: string;
    batch_id: string | null;
  }>;

  // Exclude already-batched rows
  const unbatched = rows.filter((r) => !r.batch_id);
  if (unbatched.length === 0) {
    return NextResponse.json(
      { error: 'No unbatched payout ledger rows found for the selected payments' },
      { status: 400 }
    );
  }

  // ── Force-flip 'owed' rows to 'release_ready' ────────────────────────────
  const owedRows = unbatched.filter((r) => r.status === 'owed');
  if (owedRows.length > 0) {
    const owedIds = owedRows.map((r) => r.id);

    // Update ledger status
    const { error: flipErr } = await admin
      .from('payout_ledger')
      .update({ status: 'release_ready', updated_at: new Date().toISOString() })
      .in('id', owedIds);

    if (flipErr) {
      console.error('[create-batch] flip owed→release_ready failed:', flipErr);
      return NextResponse.json({ error: flipErr.message }, { status: 500 });
    }

    // Move balance: pending_ttd -= amount, available_ttd += amount per tutor
    const amountByTutor = new Map<string, number>();
    for (const r of owedRows) {
      amountByTutor.set(
        r.tutor_id,
        (amountByTutor.get(r.tutor_id) ?? 0) + Number(r.amount_ttd)
      );
    }

    const tutorIdsToAdjust = Array.from(amountByTutor.keys());
    if (tutorIdsToAdjust.length > 0) {
      const { data: balanceRows } = await admin
        .from('tutor_balances')
        .select('tutor_id, pending_ttd, available_ttd')
        .in('tutor_id', tutorIdsToAdjust);

      const balanceMap = new Map(
        (balanceRows ?? []).map((b: any) => [b.tutor_id, b])
      );

      await Promise.all(
        tutorIdsToAdjust.map((tutorId) => {
          const amount  = Math.round((amountByTutor.get(tutorId) ?? 0) * 100) / 100;
          const current = balanceMap.get(tutorId);
          const newPending   = Math.max(0, Math.round(((current?.pending_ttd   ?? 0) - amount) * 100) / 100);
          const newAvailable = Math.round(((current?.available_ttd ?? 0) + amount) * 100) / 100;

          return admin
            .from('tutor_balances')
            .upsert(
              { tutor_id: tutorId, pending_ttd: newPending, available_ttd: newAvailable, last_updated: new Date().toISOString() },
              { onConflict: 'tutor_id' }
            )
            .then(({ error }) => {
              if (error) console.error('[create-batch] tutor_balances upsert failed for', tutorId, error);
            });
        })
      );
    }
  }

  // ── Create batch via create_payout_batch_atomic ───────────────────────────
  const eligibleIds = unbatched.map((r) => r.id);
  const totalAmount = unbatched.reduce((s, r) => s + Number(r.amount_ttd), 0);
  const uniqueTutors = new Set(unbatched.map((r) => r.tutor_id)).size;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `itutor-lesson-payouts-${ts}.csv`;

  const { data: rpcResult, error: rpcErr } = await (admin as any).rpc(
    'create_payout_batch_atomic',
    {
      p_generated_by:     auth.user!.id,
      p_total_amount_ttd: Math.round(totalAmount * 100) / 100,
      p_line_count:       uniqueTutors,
      p_csv_filename:     filename,
      p_ledger_ids:       eligibleIds,
    }
  );

  if (rpcErr || !rpcResult) {
    const msg = rpcErr?.message ?? 'Failed to create batch';
    const status = msg.includes('no_eligible_lines') ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  const rpc = rpcResult as Record<string, any>;

  // ── Build CSV ─────────────────────────────────────────────────────────────
  const tutorIds = Array.from(new Set(unbatched.map((r) => r.tutor_id)));
  const [{ data: profiles }, { data: accounts }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email').in('id', tutorIds),
    admin
      .from('tutor_payout_accounts')
      .select('tutor_id, payout_name, payout_account_identifier, bank_name, branch, account_type')
      .in('tutor_id', tutorIds),
  ]);

  const profileById  = new Map((profiles  ?? []).map((p: any) => [p.id, p]));
  const accountByTutor = new Map((accounts ?? []).map((a: any) => [a.tutor_id, a]));

  const stampedIds = new Set<string>(
    Array.isArray(rpc.stamped_ledger_ids) ? rpc.stamped_ledger_ids : []
  );
  const amountByTutorFinal = new Map<string, number>();
  for (const r of unbatched) {
    if (!stampedIds.has(r.id)) continue;
    amountByTutorFinal.set(
      r.tutor_id,
      (amountByTutorFinal.get(r.tutor_id) ?? 0) + Number(r.amount_ttd)
    );
  }

  function cell(v: string | number | null | undefined): string {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  }

  const csvRows = ['tutor_id,name,bank_name,branch,account_number,account_type,amount_ttd,reference'];
  for (const [tutorId, amount] of amountByTutorFinal) {
    const acc = accountByTutor.get(tutorId);
    const pro = profileById.get(tutorId);
    csvRows.push([
      cell(tutorId),
      cell(acc?.payout_name ?? pro?.full_name ?? ''),
      cell(acc?.bank_name),
      cell(acc?.branch),
      cell(acc?.payout_account_identifier),
      cell(acc?.account_type),
      cell((Math.round(amount * 100) / 100).toFixed(2)),
      cell(`ITUTOR-${rpc.batch_id?.slice(0, 8) ?? 'BATCH'}`),
    ].join(','));
  }

  return NextResponse.json({
    ok: true,
    batch: {
      id:               rpc.batch_id,
      generated_at:     rpc.generated_at,
      total_amount_ttd: rpc.total_amount_ttd,
      line_count:       rpc.line_count,
      status:           rpc.status,
      csv_filename:     filename,
    },
    csv:      csvRows.join('\r\n') + '\r\n',
    filename,
    stamped_count: stampedIds.size,
  });
}
