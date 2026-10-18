'use client';

// The dashboard's credits strip — deliberately one slim row. Its single job
// is "share to earn": the headline says it, the link row does it (copy, or
// the phone's share sheet). The balance lives in the top-bar counter, and
// everything else is a tap away on Rewards. Renders nothing until there is
// something to show (rewardsVisible) — so before launch, nothing at all.
//
// Desktop: one row, headline left, link right. Phone: the same two pieces
// stacked.

import Link from 'next/link';
import { ChevronRight, Gift } from 'lucide-react';
import { fmtCredits, rewardsVisible, useCredits } from '@/lib/credits/useCredits';
import { formatTtd } from '@/components/credits/AnimatedNumber';
import ShareCard from '@/components/credits/ShareCard';

export default function DashboardRewardsCard() {
  const lite = useCredits('lite');
  const referralsOn = Boolean(lite.data?.programme?.referrals_enabled) && !lite.data?.suspended;
  // The full payload carries the referral link; only fetched when it is needed.
  const full = useCredits('full', referralsOn);
  if (!rewardsVisible(lite.data)) return null;

  const data = lite.data!;
  const href = data.role === 'parent' ? '/parent/rewards' : '/student/rewards';
  const balance = data.wallet?.available ?? 0;
  const link = referralsOn ? full.data?.referral?.link ?? null : null;
  const required = Math.max(1, data.programme?.referrals_required ?? 1);
  const reward = formatTtd(data.programme?.credit_value_ttd ?? 0, { compact: true });

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-brand-soft px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
      <Link href={href} className="group flex min-w-0 items-center gap-3 sm:flex-1">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-deep text-white">
          <Gift className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0">
          {referralsOn ? (
            <>
              <span className="block text-base font-bold leading-tight tracking-tight text-ink">
                Share to earn <span className="text-brand-deep">{reward}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-0.5 text-xs text-muted-foreground">
                <span className="truncate">
                  {required === 1 ? 'For every friend who joins a class' : `For every ${required} friends who join a class`}
                </span>
                <ChevronRight className="size-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
              </span>
            </>
          ) : (
            <>
              <span className="block text-base font-bold leading-tight tracking-tight text-ink tabular-nums">
                {fmtCredits(balance)} in credits
              </span>
              <span className="mt-0.5 flex items-center gap-0.5 text-xs text-muted-foreground">
                <span className="truncate">Use them on any group class</span>
                <ChevronRight className="size-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
              </span>
            </>
          )}
        </span>
      </Link>
      {link ? (
        <div className="min-w-0 sm:w-[24rem] sm:shrink-0">
          <ShareCard link={link} compact />
        </div>
      ) : null}
    </section>
  );
}
