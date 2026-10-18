// Can credits pay for this? Pure: no database, no Stripe —
// scripts/verify-credit-quote.ts tests it.
//
// THE RULE: credits pay for a payment IN FULL or not at all. There is no
// part-credit, part-card payment (owner's decision, Oct 2026). So:
//
//   A  the next renewal of an existing subscription — credits cover the whole
//      renewal, which is then a TT$0 invoice on the card already saved
//   B  one month of a class — credits cover the whole month, no card at all
//   C  a NEW subscription — never: its first invoice must be a real card
//      payment, or Stripe starts the subscription with no card saved and
//      month two fails
//
// A wallet that holds less than the price cannot be used on it; the quote
// says how much more is needed.

import type { CreditScenario } from '@/lib/credits/types';

export interface CreditQuote {
  scenario: CreditScenario;
  /** The price (base) the credits must cover. What the tutor is paid on. */
  baseTtd: number;
  /** baseTtd when credits cover it, else 0. */
  creditsApplied: number;
  /** Always 0 when credits apply; the full price when they do not. */
  cashBase: number;
  processingFee: number;
  cashGross: number;
  cashGrossCents: number;
  /** Credits cover the whole price. The only way credits are ever used. */
  fullCoverage: boolean;
  /** How much more credit would be needed to cover it. 0 when covered. */
  shortfallTtd: number;
  /**
   * Why credits cannot be used:
   *   'no_balance'        nothing available
   *   'not_enough'        less than the full price available (or requested)
   *   'new_subscription'  credits never start a subscription
   */
  refusedReason: 'no_balance' | 'not_enough' | 'new_subscription' | null;
}

const toCents = (ttd: number) => Math.round(ttd * 100);
const fromCents = (cents: number) => Math.round(cents) / 100;

export function quoteCredits(params: {
  scenario: CreditScenario;
  baseTtd: number;
  balanceTtd: number;
  /** Credits the user offered; omitted = their whole balance. */
  requestedTtd?: number | null;
}): CreditQuote {
  const { scenario } = params;
  const baseCents = Math.max(0, toCents(params.baseTtd));
  const balanceCents = Math.max(0, Math.floor(params.balanceTtd * 100 + 1e-6));
  const offeredCents =
    params.requestedTtd === null || params.requestedTtd === undefined
      ? balanceCents
      : Math.min(balanceCents, Math.max(0, Math.floor(params.requestedTtd * 100 + 1e-6)));

  const refused = (reason: NonNullable<CreditQuote['refusedReason']>): CreditQuote => ({
    scenario,
    baseTtd: fromCents(baseCents),
    creditsApplied: 0,
    cashBase: fromCents(baseCents),
    processingFee: 0,
    cashGross: 0,
    cashGrossCents: 0,
    fullCoverage: false,
    shortfallTtd: fromCents(Math.max(0, baseCents - balanceCents)),
    refusedReason: reason,
  });

  if (scenario === 'C') return refused('new_subscription');
  if (baseCents <= 0) return refused('not_enough');
  if (balanceCents <= 0) return refused('no_balance');
  if (offeredCents < baseCents) return refused('not_enough');

  return {
    scenario,
    baseTtd: fromCents(baseCents),
    creditsApplied: fromCents(baseCents),
    cashBase: 0,
    processingFee: 0,
    cashGross: 0,
    cashGrossCents: 0,
    fullCoverage: true,
    shortfallTtd: 0,
    refusedReason: null,
  };
}
