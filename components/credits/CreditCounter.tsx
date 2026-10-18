'use client';

// The credit counter in the student and parent top bar — on every page, so
// the balance is always one glance away and one tap from Rewards. (The student
// mobile tab bar has no room for Rewards; this is how a phone gets there.)
//
// States, each a different job:
//   balance          gift + amount — what you can spend
//   only pending     clock + amount — earned, not spendable yet
//   nothing yet      "Earn TT$250" — the invitation (referrals on only)
//   nothing to show  renders nothing (programmes off and no balance: before
//                    launch no one sees it)
//
// Motion: the press scales to 0.97 (the interface heard you). When the
// balance goes UP while you're looking — a code redeemed, a reward landed —
// the amount rolls to the new value and a ring fades out once. Never on page
// load: this counter is seen dozens of times a day.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Clock, Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rewardsVisible, useCredits } from '@/lib/credits/useCredits';
import AnimatedNumber, { formatTtd } from '@/components/credits/AnimatedNumber';
import { pressable } from '@/components/credits/press';

export default function CreditCounter({ className }: { className?: string }) {
  const { data } = useCredits('lite');
  const balance = data?.wallet?.available ?? 0;
  const pending = data?.wallet?.pending ?? 0;

  // A one-shot ring when the balance rises after the first load.
  const previous = useRef<number | null>(null);
  const [glow, setGlow] = useState(false);
  useEffect(() => {
    if (!data?.available) return;
    const rose = previous.current !== null && balance > previous.current;
    previous.current = balance;
    if (!rose) return;
    setGlow(true);
    const t = setTimeout(() => setGlow(false), 60);
    return () => clearTimeout(t);
  }, [balance, data?.available]);

  if (!data || !rewardsVisible(data) || data.suspended) return null;

  const href = data.role === 'parent' ? '/parent/rewards' : '/student/rewards';
  const referralsOn = Boolean(data.programme?.referrals_enabled);
  const reward = data.programme?.credit_value_ttd ?? 0;

  const mode: 'balance' | 'pending' | 'earn' | null =
    balance > 0 ? 'balance' : pending > 0 ? 'pending' : referralsOn && reward > 0 ? 'earn' : null;
  if (!mode) return null;

  const label =
    mode === 'balance'
      ? `${formatTtd(balance)} in iTutor credits${pending > 0 ? `, ${formatTtd(pending)} more on the way` : ''}. Open Rewards.`
      : mode === 'pending'
        ? `${formatTtd(pending)} in credits on the way. Open Rewards.`
        : `Invite friends and earn ${formatTtd(reward)} in credits. Open Rewards.`;

  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold',
        pressable,
        mode === 'earn'
          ? 'bg-brand-soft text-brand-deep hover:bg-brand-light'
          : 'bg-brand-deep text-white shadow-sm hover:bg-brand-dark',
        className
      )}
    >
      {/* The ring snaps on, then fades over 900ms. Opacity only. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -inset-1 rounded-full ring-2 ring-brand transition-opacity',
          glow ? 'opacity-70 duration-0' : 'opacity-0 duration-[900ms] ease-out'
        )}
      />
      {mode === 'pending' ? <Clock className="size-4 shrink-0" aria-hidden /> : <Gift className="size-4 shrink-0" aria-hidden />}
      {mode === 'earn' ? (
        <span className="whitespace-nowrap tabular-nums">
          <span className="hidden sm:inline">Earn </span>
          {formatTtd(reward, { compact: true })}
        </span>
      ) : (
        <AnimatedNumber value={mode === 'balance' ? balance : pending} compact className="whitespace-nowrap" />
      )}
      {mode === 'pending' ? <span className="hidden text-xs font-medium opacity-80 sm:inline">on the way</span> : null}
      {mode === 'balance' && pending > 0 ? (
        // More is on the way: a quiet dot, spelled out in the label.
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-white/80" />
      ) : null}
    </Link>
  );
}
