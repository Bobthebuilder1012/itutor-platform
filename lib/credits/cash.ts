// Money a subscription_payments row actually COLLECTED, as opposed to what the
// class cost.
//
//   amount_ttd                   the class price (the base). Commission and the
//                                tutor's payout are computed from it, and it
//                                stays the full price even when credits paid
//                                part of it — iTutor funds credits, not tutors.
//   credits_applied_ttd          the part of amount_ttd credits covered
//                                (migration 268; absent before it)
//   charged_processing_fee_ttd   the card fee on top, charged on the cash part
//
// Anything that means "what the student paid" or "what came in" must use
// these helpers rather than amount_ttd, or credit-funded months show up as
// cash revenue. Tutor-facing views keep using amount_ttd.

import { isMissingSchema } from '@/lib/supabase/schemaErrors';

type MoneyRow = {
  amount_ttd?: number | string | null;
  credits_applied_ttd?: number | string | null;
  charged_processing_fee_ttd?: number | string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function creditsAppliedTtd(row: MoneyRow | null | undefined): number {
  return round2(Number(row?.credits_applied_ttd ?? 0) || 0);
}

/** The class price paid in cash: amount_ttd less credits. Excludes the card fee. */
export function cashBaseTtd(row: MoneyRow | null | undefined): number {
  return round2(Math.max(0, Number(row?.amount_ttd ?? 0) - creditsAppliedTtd(row)));
}

/** Everything the payer was charged: the cash base plus the card fee. */
export function cashPaidTtd(row: MoneyRow | null | undefined): number {
  return round2(cashBaseTtd(row) + Number(row?.charged_processing_fee_ttd ?? 0));
}

/**
 * ', credits_applied_ttd' when `on`, else ''. For building selects inside
 * withOptionalCredits.
 */
export const creditsCol = (on: boolean) => (on ? ', credits_applied_ttd' : '');

/**
 * Run a select that includes credits_applied_ttd, retrying without it on a
 * database where migration 268 has not been applied — PostgREST rejects the
 * whole select for one unknown column, which would blank the page.
 *
 *   withOptionalCredits((on) =>
 *     admin.from('subscription_payments').select(`id, amount_ttd${creditsCol(on)}`))
 */
export async function withOptionalCredits(
  run: (withCredits: boolean) => PromiseLike<{ data: unknown; error: { code?: unknown; message?: string } | null }>
): Promise<{ data: any; error: { code?: unknown; message?: string } | null }> {
  // A built-up column string loses supabase-js's row typing anyway, so the
  // rows come back untyped; read money through the helpers above.
  const first = await run(true);
  if (first.error && isMissingSchema(first.error)) return run(false);
  return first;
}
