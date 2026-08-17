/**
 * Class Match Week — savings hero, the dashboard's headline block (docs 04 §4.1).
 *
 * The figure is computed SERVER-SIDE — the sum of each coupon's savingsValue,
 * which reads the price snapshot taken at issue, never the live class price,
 * so the number cannot drift when a teacher edits pricing mid-week — and
 * arrives here as a plain prop. This component only renders.
 *
 * Two ACCEPTED risks, recorded from docs/class-match-week/04 §4.1 so nobody
 * relitigates them in a PR:
 *
 *  1. "The figure combines unlocked and redeemed savings, so it displays money
 *     the user has not saved on classes they have not bought." Accepted as-is;
 *     flagged for whoever handles consumer-protection questions, but it ships.
 *
 *  2. "'Keep attending to save more' rewards accumulating sessions. Combined
 *     with join-click attendance and no reservation cap, this incentivises
 *     coupon collection." Accepted: the cost is the denominator — enrolment
 *     conversion looks worse than it is — and is mitigated by the cohort split
 *     in the §4.6 admin export, not by changing this copy.
 */

import { fmtTTD } from '@/lib/utils/formatCurrency';

export default function SavingsHero({ savedTotal }: { savedTotal: number }) {
  const hasSavings = Number.isFinite(savedTotal) && savedTotal > 0;

  return (
    <section className="rounded-3xl bg-brand-deep p-6 text-white shadow-card">
      <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">Your savings</p>
      <p className="mt-1 text-3xl font-bold tracking-tight">{fmtTTD(hasSavings ? savedTotal : 0)}</p>
      {hasSavings ? (
        <p className="mt-2 text-sm leading-relaxed text-white/90">
          You saved {fmtTTD(savedTotal)} — keep attending classes to save more!
        </p>
      ) : (
        // The TT$0 state invites rather than boasts: there is nothing to brag
        // about yet, and the next action is attending a session.
        <p className="mt-2 text-sm leading-relaxed text-white/90">
          Nothing saved yet — join a free session and you&rsquo;ll unlock a discount on that
          teacher&rsquo;s ongoing class.
        </p>
      )}
    </section>
  );
}
