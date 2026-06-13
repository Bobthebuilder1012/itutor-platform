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

  // Two modes:
  //   payout_ledger_ids   — direct ledger IDs (1:1 session payouts)
  //   subscription_payment_ids — look up ledger rows by subscription payment (subscriptions)
  const ledgerIds: string[] | null = Array.isArray(body?.payout_ledger_ids) && body.payout_ledger_ids.length > 0
    ? body.payout_ledger_ids
    : null;
  const spIds: string[] = Array.isArray(body?.subscription_payment_ids)
    ? body.subscription_payment_ids
    : [];

  if (!ledgerIds && spIds.length === 0) {
    return NextResponse.json(
      { error: 'Provide payout_ledger_ids (1:1 payouts) or subscription_payment_ids (subscription payouts)' },
      { status: 400 }
    );
  }
  if ((ledgerIds?.length ?? spIds.length) > 200) {
    return NextResponse.json({ error: 'Maximum 200 IDs per batch' }, { status: 400 });
  }

  const admin = getServiceClient();

  // ── Load payout_ledger rows ───────────────────────────────────────────────
  const { data: ledgerRows, error: ledgerErr } = ledgerIds
    ? await admin
        .from('payout_ledger')
        .select('id, status, amount_ttd, tutor_id, batch_id')
        .in('id', ledgerIds)
        .not('status', 'in', '(reversed,admin_hold,released)')
    : await admin
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

  // ── Apply pending tutor deductions to this payout preview ────────────────
  const grossByTutor = new Map<string, number>();
  for (const r of unbatched) {
    grossByTutor.set(
      r.tutor_id,
      (grossByTutor.get(r.tutor_id) ?? 0) + Number(r.amount_ttd)
    );
  }
  const deductionPlan = await buildDeductionPlan(admin as any, grossByTutor);
  const deductionByTutor = new Map<string, number>();
  for (const item of deductionPlan) {
    deductionByTutor.set(
      item.tutorId,
      (deductionByTutor.get(item.tutorId) ?? 0) + item.amountTtd
    );
  }

  // ── Create batch via create_payout_batch_atomic ───────────────────────────
  const eligibleIds = unbatched.map((r) => r.id);
  const netByTutor = new Map<string, number>();
  for (const [tutorId, gross] of grossByTutor) {
    const deduction = deductionByTutor.get(tutorId) ?? 0;
    netByTutor.set(tutorId, Math.max(0, Math.round((gross - deduction) * 100) / 100));
  }
  const totalAmount = Array.from(netByTutor.values()).reduce((s, amount) => s + amount, 0);
  const uniqueTutors = Array.from(netByTutor.values()).filter((amount) => amount > 0).length;
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

  if (deductionPlan.length > 0) {
    await reserveDeductionPlan(admin as any, deductionPlan, rpc.batch_id);
  }

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
    const deduction = deductionByTutor.get(tutorId) ?? 0;
    const netAmount = Math.max(0, Math.round((amount - deduction) * 100) / 100);
    if (netAmount <= 0) continue;

    const acc = accountByTutor.get(tutorId);
    const pro = profileById.get(tutorId);
    csvRows.push([
      cell(tutorId),
      cell(acc?.payout_name ?? pro?.full_name ?? ''),
      cell(acc?.bank_name),
      cell(acc?.branch),
      cell(acc?.payout_account_identifier),
      cell(acc?.account_type),
      cell(netAmount.toFixed(2)),
      cell(`ITUTOR-${rpc.batch_id?.slice(0, 8) ?? 'BATCH'}`),
    ].join(','));
  }

  const csvBody = csvRows.join('\r\n') + '\r\n';

  // Retain the CSV server-side so the batch satisfies the mark-paid
  // download gate (mig 186) and the file can be re-downloaded later.
  // batch_type follows the mode: subscription IDs → lesson, else 1:1.
  await admin
    .from('payout_batches')
    .update({
      csv_body: csvBody,
      csv_generated_at: new Date().toISOString(),
      batch_type: ledgerIds ? 'one_on_one' : 'lesson',
    })
    .eq('id', rpc.batch_id);

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
    csv:      csvBody,
    filename,
    stamped_count: stampedIds.size,
    deductions_applied_ttd: +Array.from(deductionByTutor.values()).reduce((s, amount) => s + amount, 0).toFixed(2),
  });
}

type DeductionAllocation = {
  id: string;
  tutorId: string;
  amountTtd: number;
  remainderTtd: number;
  reason: string;
  sourceEnrollmentId: string | null;
  sourcePaymentId: string | null;
  sourceSubscriptionPaymentId: string | null;
};

async function buildDeductionPlan(
  admin: any,
  grossByTutor: Map<string, number>
): Promise<DeductionAllocation[]> {
  const tutorIds = Array.from(grossByTutor.keys());
  if (tutorIds.length === 0) return [];

  const { data, error } = await admin
    .from('tutor_deductions')
    .select('id, tutor_id, amount_ttd, reason, source_enrollment_id, source_payment_id, source_subscription_payment_id')
    .in('tutor_id', tutorIds)
    .eq('status', 'pending')
    .is('deducted_from_batch_id', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[create-batch] failed to load tutor_deductions:', error);
    return [];
  }

  const remainingByTutor = new Map(grossByTutor);
  const plan: DeductionAllocation[] = [];

  for (const row of data ?? []) {
    const tutorId = row.tutor_id as string;
    const availableGross = Math.round((remainingByTutor.get(tutorId) ?? 0) * 100) / 100;
    if (availableGross <= 0) continue;

    const rowAmount = Math.round(Number(row.amount_ttd ?? 0) * 100) / 100;
    const allocation = Math.round(Math.min(rowAmount, availableGross) * 100) / 100;
    if (allocation <= 0) continue;

    plan.push({
      id: row.id,
      tutorId,
      amountTtd: allocation,
      remainderTtd: Math.round((rowAmount - allocation) * 100) / 100,
      reason: row.reason,
      sourceEnrollmentId: row.source_enrollment_id,
      sourcePaymentId: row.source_payment_id,
      sourceSubscriptionPaymentId: row.source_subscription_payment_id,
    });

    remainingByTutor.set(tutorId, Math.round((availableGross - allocation) * 100) / 100);
  }

  return plan;
}

async function reserveDeductionPlan(
  admin: any,
  plan: DeductionAllocation[],
  batchId: string
): Promise<void> {
  for (const item of plan) {
    const { error: updateError } = await admin
      .from('tutor_deductions')
      .update({
        amount_ttd: item.amountTtd,
        deducted_from_batch_id: batchId,
      })
      .eq('id', item.id)
      .eq('status', 'pending');

    if (updateError) {
      console.error('[create-batch] failed to reserve tutor_deduction:', item.id, updateError);
      continue;
    }

    if (item.remainderTtd > 0) {
      const { error: insertError } = await admin
        .from('tutor_deductions')
        .insert({
          tutor_id: item.tutorId,
          amount_ttd: item.remainderTtd,
          reason: item.reason,
          source_enrollment_id: item.sourceEnrollmentId,
          source_payment_id: item.sourcePaymentId,
          source_subscription_payment_id: item.sourceSubscriptionPaymentId,
          status: 'pending',
        });

      if (insertError) {
        console.error('[create-batch] failed to carry tutor_deduction remainder:', item.id, insertError);
      }
    }
  }
}
