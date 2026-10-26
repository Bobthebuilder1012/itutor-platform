// How many credits a payment can take, and what is left for the card. Pure:
// no database, no Stripe — scripts/verify-credit-quote.ts tests it.
//
// The rules (spec §4):
//   1. Credits reduce the class price BEFORE the processing fee, and the fee
//      is recalculated on the cash that remains. When credits cover
//      everything there is no card charge and no fee.
//   2. A payment takes at most its own price in credits. The rest stays in
//      the wallet.
//   3. The cash left is either zero or at least the minimum card charge. Zero
//      is allowed only for A (a renewal: the card is already saved) and B (a
//      one-off month: no card needed at all). Credits are lowered, a cent at
//      a time, until this holds.
//   4. C — a NEW subscription — always needs real cash on its first invoice.
//      Stripe would happily start a subscription on a TT$0 first invoice, but
//      with no card saved, so month two would fail. This is a technical rule
//      as much as a policy.

import { calculateGrossAmountForProvider, baseFromGrossForProvider } from '@/lib/payments/grossUp';
import type { CreditScenario } from '@/lib/credits/types';

export interface CreditQuote {
  scenario: CreditScenario;
  /** The class price (base) before credits. What the tutor is paid on. */
  baseTtd: number;
  creditsApplied: number;
  /** Base left for the card: baseTtd − creditsApplied. */
  cashBase: number;
  /** Fee on cashBase; 0 when cashBase is 0. */
  processingFee: number;
  /** What the card is charged. */
  cashGross: number;
  cashGrossCents: number;
  /** Credits cover the whole price (A and B only). */
  fullCoverage: boolean;
  /** Credits were lowered so the card charge meets the minimum. */
  loweredForMinimum: boolean;
  /**
   * How far the WALLET falls short of the whole price, regardless of whether
   * a part payment is allowed. Callers that still demand full coverage — a
   * renewal (A), and a month (B) while CREDIT_SUBSIDY_ENABLED is off — use
   * this to tell the student how much more they need.
   */
  shortfallTtd: number;
  /**
   * Why no credits could be applied at all, when credits were asked for:
   *   'no_balance'      nothing available
   *   'below_minimum'   any credit would leave a card charge under the minimum
   */
  refusedReason: 'no_balance' | 'below_minimum' | null;
}

const toCents = (ttd: number) => Math.round(ttd * 100);
const fromCents = (cents: number) => Math.round(cents) / 100;

function gross(cashBase: number): { fee: number; gross: number } {
  if (cashBase <= 0) return { fee: 0, gross: 0 };
  const g = calculateGrossAmountForProvider(cashBase, 'stripe');
  return { fee: g.processingFee, gross: g.grossAmount };
}

/** The smallest cash base whose card charge is at least `minChargeTtd`. */
export function minimumCashBase(minChargeTtd: number): number {
  if (minChargeTtd <= 0) return 0.01;
  let cents = Math.max(1, toCents(baseFromGrossForProvider(minChargeTtd, 'stripe')));
  // baseFromGross rounds; walk to the exact boundary in whole cents.
  while (cents > 1 && gross(fromCents(cents - 1)).gross >= minChargeTtd) cents -= 1;
  while (gross(fromCents(cents)).gross < minChargeTtd) cents += 1;
  return fromCents(cents);
}

export function quoteCredits(params: {
  scenario: CreditScenario;
  baseTtd: number;
  balanceTtd: number;
  /** Credits the user asked to apply; omitted = as many as allowed. */
  requestedTtd?: number | null;
  minCashChargeTtd: number;
}): CreditQuote {
  const { scenario } = params;
  const baseCents = Math.max(0, toCents(params.baseTtd));
  const balanceCents = Math.max(0, Math.floor(params.balanceTtd * 100 + 1e-6));
  const requestedCents =
    params.requestedTtd === null || params.requestedTtd === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.floor(params.requestedTtd * 100 + 1e-6));

  let creditCents = Math.min(baseCents, balanceCents, requestedCents);
  let loweredForMinimum = false;
  let refusedReason: CreditQuote['refusedReason'] = null;

  if (creditCents <= 0) {
    creditCents = 0;
    if (requestedCents > 0 && balanceCents <= 0) refusedReason = 'no_balance';
  } else {
    const zeroCashAllowed = scenario === 'A' || scenario === 'B';
    const covered = creditCents >= baseCents;
    if (!(covered && zeroCashAllowed)) {
      // Some cash remains (or must remain): it has to reach the minimum.
      const minCashCents = toCents(minimumCashBase(params.minCashChargeTtd));
      const cashCents = baseCents - creditCents;
      if (cashCents < minCashCents) {
        loweredForMinimum = true;
        creditCents = Math.max(0, baseCents - minCashCents);
        if (creditCents === 0) refusedReason = 'below_minimum';
      }
    }
  }

  const cashBase = fromCents(baseCents - creditCents);
  const { fee, gross: cashGross } = gross(cashBase);

  return {
    scenario,
    baseTtd: fromCents(baseCents),
    creditsApplied: fromCents(creditCents),
    cashBase,
    processingFee: fee,
    cashGross,
    cashGrossCents: toCents(cashGross),
    fullCoverage: creditCents > 0 && creditCents === baseCents,
    loweredForMinimum,
    shortfallTtd: fromCents(Math.max(0, baseCents - balanceCents)),
    refusedReason,
  };
}
