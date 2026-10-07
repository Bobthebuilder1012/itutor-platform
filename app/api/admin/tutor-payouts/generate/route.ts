// POST /api/admin/tutor-payouts/generate
//
// Body: { tutor_ids: string[] }
//
// Builds the bank CSV for the tutors finance ticked — any tutor, due or not —
// with one line per tutor for everything they are owed in lesson earnings.
// A bank file is single-currency, so TTD and USD lines become separate
// batches, one CSV each.
//
// This does NOT mark anyone paid. The rows are stamped into a batch (so they
// can't go into a second CSV) and wait for an explicit "Confirm payout" —
// POST /api/admin/payouts/:batchId/mark-paid — which releases them and moves
// each tutor to their next payout date.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { loadTeacherPayouts } from '@/lib/payouts/teacherPayouts';
import { createPayoutBatch } from '@/lib/payouts/createPayoutBatch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const tutorIds: string[] = Array.isArray(body?.tutor_ids)
    ? Array.from(new Set(body.tutor_ids.filter((x: unknown) => typeof x === 'string')))
    : [];
  if (tutorIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one tutor' }, { status: 400 });
  }
  if (tutorIds.length > 200) {
    return NextResponse.json({ error: 'Maximum 200 tutors per payout' }, { status: 400 });
  }

  const admin = getServiceClient();

  try {
    const { tutors } = await loadTeacherPayouts(admin, { tutorIds });

    const skipped: Array<{ tutor_id: string; name: string; reason: string }> = [];
    const idsByCurrency: Record<'TTD' | 'USD', string[]> = { TTD: [], USD: [] };

    for (const id of tutorIds) {
      const t = tutors.find((x) => x.tutor_id === id);
      if (!t || t.owed_count === 0) {
        skipped.push({ tutor_id: id, name: t?.name ?? 'Unknown tutor', reason: 'Nothing owed' });
        continue;
      }
      if (!t.has_bank_details) {
        skipped.push({ tutor_id: id, name: t.name, reason: 'No bank details on file' });
        continue;
      }
      const owed = t.rows.filter((r) => r.state === 'owed');
      const usdMissingRate = owed.some((r) => r.payout_currency === 'USD' && r.amount_usd == null);
      for (const r of owed) {
        // A USD row without its frozen rate has no payable amount yet.
        if (r.payout_currency === 'USD' && usdMissingRate) continue;
        idsByCurrency[r.payout_currency].push(r.ledger_id);
      }
      if (usdMissingRate) {
        skipped.push({ tutor_id: id, name: t.name, reason: "USD earnings have no exchange rate yet — set the day's rate, then retry" });
      }
    }

    const files: Array<{ currency: 'TTD' | 'USD'; batch: any; csv: string; filename: string }> = [];
    const errors: string[] = [];
    for (const currency of ['TTD', 'USD'] as const) {
      const ledgerIds = idsByCurrency[currency];
      if (ledgerIds.length === 0) continue;
      const result = await createPayoutBatch(admin, auth.user!.id, { ledgerIds, batchType: 'lesson' });
      if (result.status !== 200) {
        errors.push(`${currency}: ${result.body?.error ?? 'batch failed'}`);
        continue;
      }
      files.push({ currency, batch: result.body.batch, csv: result.body.csv, filename: result.body.filename });
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: errors[0] ?? 'Nothing to pay for the selected tutors', skipped, errors },
        { status: errors.length > 0 ? 409 : 400 }
      );
    }
    return NextResponse.json({ ok: true, files, skipped, errors });
  } catch (err: any) {
    console.error('[POST /api/admin/tutor-payouts/generate]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to generate payout CSV' }, { status: 500 });
  }
}
