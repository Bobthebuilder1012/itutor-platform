'use client';

/**
 * The credit meter pill in the top bar — "24 of 40" with a progress bar.
 *
 * Rule 2 made visible. v1 metered on a lifetime counter nobody could see, so a
 * tutor discovered they were out of uses by being refused. A balance that is
 * always on screen is the difference between a limit and an ambush.
 *
 * The handoff flags top-bar density as a real risk: search, campaign CTA, this
 * meter, history, notifications and settings is six controls, and they crowd at
 * tablet widths. Below `lg` the bar drops away and the pill becomes icon plus
 * count; below `sm` it goes entirely, since the hub shows the same number in
 * its own header.
 */

import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AiCreditMeterProps {
  /** Remaining balance, from ai_credit_ledger. */
  remaining: number;
  /** The tier's monthly_credits, from ai_entitlements. */
  monthly: number;
  className?: string;
}

export default function AiCreditMeter({ remaining, monthly, className }: AiCreditMeterProps) {
  // A monthly allowance of zero would divide by zero and, more importantly,
  // means this tier is not metered at all — showing "0 of 0" would be a lie.
  if (monthly <= 0) return null;

  const safeRemaining = Math.max(0, Math.min(remaining, monthly));
  const pct = Math.round((safeRemaining / monthly) * 100);

  // Colour is information, not decoration: the pill only changes tone once the
  // number starts to matter.
  const low = pct <= 25;
  const empty = safeRemaining === 0;

  return (
    <div
      title={`${safeRemaining} of ${monthly} generations left this month`}
      className={cn(
        'hidden sm:inline-flex items-center gap-[7px] px-[11px] py-1.5 mr-1',
        'rounded-full border bg-background whitespace-nowrap shrink-0',
        empty ? 'border-red-300' : low ? 'border-amber-300' : 'border-surface-border',
        className
      )}
    >
      <Zap
        className={cn(
          'size-[13px]',
          empty ? 'text-red-600' : low ? 'text-amber-600' : 'text-brand-dark'
        )}
      />
      <span className="text-xs font-semibold text-ink tabular-nums">
        {safeRemaining} of {monthly}
      </span>
      {/* The bar is the first thing to go when space is tight — the number
          alone still answers the question. */}
      <span className="hidden lg:inline-block w-[38px] h-1 rounded-full bg-surface-border overflow-hidden">
        <span
          className={cn(
            'block h-full transition-[width] duration-300',
            empty ? 'bg-red-500' : low ? 'bg-amber-500' : 'bg-brand'
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}
