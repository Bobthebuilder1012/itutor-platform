'use client';

// "Pay with credits" on a class's join flow. Credits pay for a whole month or
// nothing (lib/credits/quote.ts), so there are two choices:
//
//   none        subscribe and pay by card as usual
//   one_month   one month only, paid entirely with credits — no card; it
//               does not renew
//
// Renders nothing for someone with no credits. With some credits but not
// enough for a month, it says how much more is needed.

import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtCredits, useCredits } from '@/lib/credits/useCredits';
import type { CreditQuote } from '@/lib/credits/quote';

export type CreditChoice = 'none' | 'one_month';

export default function CheckoutCreditsChoice({
  groupId,
  value,
  onChange,
}: {
  groupId: string;
  value: CreditChoice;
  onChange: (choice: CreditChoice) => void;
}) {
  const { data } = useCredits('lite');
  const balance = data?.available && !data.suspended ? data.wallet?.available ?? 0 : 0;
  const [month, setMonth] = useState<CreditQuote | null>(null);

  useEffect(() => {
    if (balance <= 0) return;
    let cancelled = false;
    fetch(`/api/credits/quote?groupId=${encodeURIComponent(groupId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((json) => {
        if (!cancelled) setMonth(json?.available ? (json.quote as CreditQuote) : null);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, balance]);

  // Never leave a stale choice selected once it stops being possible.
  useEffect(() => {
    if (value === 'one_month' && month && !month.fullCoverage) onChange('none');
  }, [month, value, onChange]);

  if (balance <= 0 || !month) return null;

  if (!month.fullCoverage) {
    return (
      <section className="flex items-start gap-2 rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <Gift className="mt-0.5 size-4 shrink-0 text-brand" />
        <span>
          You have {fmtCredits(balance)} in credits. Credits pay for a whole month, so you need{' '}
          {fmtCredits(month.shortfallTtd)} more to use them on this class.
        </span>
      </section>
    );
  }

  const options: Array<{ v: CreditChoice; title: string; detail: string }> = [
    { v: 'none', title: 'Subscribe and pay by card', detail: 'Keep your credits for later.' },
    {
      v: 'one_month',
      title: 'Pay for one month with credits',
      detail: `Uses ${fmtCredits(month.creditsApplied)} of your credits. No card needed, and it does not renew — subscribe before it ends to keep your place.`,
    },
  ];

  return (
    <section className="space-y-3 rounded-2xl border border-brand/30 bg-brand/5 p-5">
      <h2 className="inline-flex items-center gap-2 text-sm font-bold text-ink">
        <Gift className="size-4 text-brand" /> Use your credits
        <span className="font-normal text-muted-foreground">· {fmtCredits(balance)} available</span>
      </h2>
      <div className="space-y-2">
        {options.map((opt) => {
          const selected = value === opt.v;
          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => onChange(opt.v)}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border bg-background px-4 py-3 text-left transition',
                selected ? 'border-brand' : 'border-border hover:border-brand/50'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2',
                  selected ? 'border-brand' : 'border-border'
                )}
              >
                {selected && <span className="size-2 rounded-full bg-brand" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{opt.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{opt.detail}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
