'use client';

// A small "TT$X credits" pill linking to the Rewards page. Renders nothing
// while credits are not set up, and nothing for someone with no balance while
// the referral programme is off (there is nothing to show or earn).

import Link from 'next/link';
import { Gift } from 'lucide-react';
import { fmtCredits, useCredits } from '@/lib/credits/useCredits';

export default function BalanceChip({ className = '' }: { className?: string }) {
  const { data } = useCredits('lite');
  if (!data?.available || !data.wallet) return null;
  const balance = data.wallet.available;
  const pending = data.wallet.pending;
  if (balance <= 0 && pending <= 0 && !data.programme?.referrals_enabled) return null;

  const href = data.role === 'parent' ? '/parent/rewards' : '/student/rewards';
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand-deep hover:bg-brand/15 transition ${className}`}
    >
      <Gift className="size-3.5" />
      {balance > 0 ? `${fmtCredits(balance)} credits` : pending > 0 ? `${fmtCredits(pending)} pending` : 'Earn credits'}
    </Link>
  );
}
