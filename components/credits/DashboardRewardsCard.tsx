'use client';

// The dashboard's credits strip: balance plus a compact share card when the
// referral programme is on. Renders nothing until there is something to show
// (rewardsVisible) — so before launch, nothing at all.

import Link from 'next/link';
import { ChevronRight, Gift } from 'lucide-react';
import { fmtCredits, rewardsVisible, useCredits } from '@/lib/credits/useCredits';
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
  const pending = data.wallet?.pending ?? 0;
  const link = referralsOn ? full.data?.referral?.link ?? null : null;

  return (
    <section className="rounded-2xl border border-brand/25 bg-gradient-to-br from-brand/10 to-transparent p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-brand text-white">
            <Gift className="size-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-ink">
              {balance > 0 ? `${fmtCredits(balance)} in credits` : 'Invite friends, earn credits'}
            </div>
            <div className="text-xs text-muted-foreground">
              {pending > 0
                ? `${fmtCredits(pending)} pending · `
                : ''}
              {referralsOn
                ? `Earn ${fmtCredits(data.programme!.credit_value_ttd)} when friends join a class.`
                : 'Use them on any group class.'}
            </div>
          </div>
        </div>
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-deep hover:underline">
          Rewards <ChevronRight className="size-4" />
        </Link>
      </div>
      {link ? (
        <div className="mt-4">
          <ShareCard link={link} compact />
        </div>
      ) : null}
    </section>
  );
}
