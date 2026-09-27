// Cash bookkeeping shared by the class Payments screen's two surfaces: the
// per-row actions (`/payments/[paymentId]`) and the Cash tab (`/cash-ledger`).
//
// The one rule both must apply identically: the platform never saw cash money,
// so it could not withhold its share. Recording cash raises a pending
// `tutor_deductions` row for the platform fee (migration 249); un-recording or
// voiding it waives that debt. Kept here so the two routes cannot drift.

import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateCommissionForTutor } from '@/lib/utils/commissionCalculator';

/**
 * Non-fatal on purpose: by the time this runs the cash HAS been handed over,
 * and failing the request would invite the tutor to record it twice. The
 * partial unique index in 249 makes that retry safe; the log makes a missing
 * debt findable.
 */
export async function raiseCashCommission(
  admin: SupabaseClient,
  params: { tutorId: string; paymentId: string; enrollmentId: string | null; amountTtd: number }
): Promise<void> {
  try {
    const amount = Number(params.amountTtd) || 0;
    if (amount <= 0) return;
    const { platformFee } = await calculateCommissionForTutor(admin, params.tutorId, amount);
    if (platformFee <= 0) return;
    const { error } = await admin.from('tutor_deductions').insert({
      tutor_id: params.tutorId,
      amount_ttd: platformFee,
      reason: 'cash_commission',
      source_enrollment_id: params.enrollmentId,
      source_subscription_payment_id: params.paymentId,
      status: 'pending',
    });
    // 23505 = the one-per-payment index already holds a row for this payment.
    // Either a retry (pending — nothing to do) or a month the tutor un-marked
    // and has now marked paid again (waived — the debt is owed once more). The
    // index covers waived rows too, so it has to be revived, not re-inserted.
    if (error && String(error.code) === '23505') {
      await admin
        .from('tutor_deductions')
        .update({ status: 'pending', resolved_at: null })
        .eq('source_subscription_payment_id', params.paymentId)
        .eq('reason', 'cash_commission')
        .eq('status', 'waived');
    } else if (error) {
      console.error('[cashLedger] commission debt failed:', error.message);
    }
  } catch (err) {
    console.error('[cashLedger] commission debt threw:', err);
  }
}

/**
 * The money is now said not to have arrived, so the platform's share of it is
 * not owed. Waived rather than deleted: the row is the only evidence the debt
 * was ever raised, and an admin reviewing a dispute needs it.
 */
export async function waiveCashCommission(admin: SupabaseClient, paymentId: string): Promise<void> {
  await admin
    .from('tutor_deductions')
    .update({ status: 'waived', resolved_at: new Date().toISOString() })
    .eq('source_subscription_payment_id', paymentId)
    .eq('reason', 'cash_commission')
    .eq('status', 'pending');
}

/** First instant of a YYYY-MM month, UTC — the key a cash month is stored under. */
export function monthStartIso(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toISOString();
}

export function monthEndIso(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString();
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
