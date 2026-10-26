'use client';

// "Use your credits" on a class's join flow. Three choices:
//
//   none         pay by card as usual
//   first_month  credits off the first month of the subscription (scenario C)
//                — the card still pays something, at least the minimum,
//                because a subscription cannot start on credits alone
//   one_month    one month only, paid with credits (scenario B) — no card at
//                all when the credits cover it; never renews
//
// Renders nothing for someone with no spendable credits. The figures for one
// month are exact; the first-month figure is the most that could come off —
// the checkout page shows the exact charge before anything is paid.

import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtCredits, useCredits } from '@/lib/credits/useCredits';
import type { CreditQuote } from '@/lib/credits/quote';

export type CreditChoice = 'none' | 'first_month' | 'one_month';

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
  const [first, setFirst] = useState<CreditQuote | null>(null);

  useEffect(() => {
    if (balance <= 0) return;
    let cancelled = false;
    (async () => {
      const [b, c] = await Promise.all(
        (['B', 'C'] as const).map((s) =>
          fetch(`/api/credits/quote?groupId=${encodeURIComponent(groupId)}&scenario=${s}`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        )
      );
      if (cancelled) return;
      setMonth(b?.available ? (b.quote as CreditQuote) : null);
      setFirst(c?.available ? (c.quote as CreditQuote) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, balance]);

  if (balance <= 0) return null;

  const options: Array<{ v: CreditChoice; title: string; detail: string; disabled?: boolean }> = [
    { v: 'none', title: 'Pay by card', detail: 'Keep your credits for later.' },
  ];
  if (first && first.creditsApplied > 0) {
    options.push({
      v: 'first_month',
      title: `Use up to ${fmtCredits(first.creditsApplied)} on my first month`,
      detail: `Your subscription starts as normal and renews at the full price. The card pays at least ${fmtCredits(first.cashGross)} today.`,
    });
  }
  if (month && month.creditsApplied > 0) {
    options.push({
      v: 'one_month',
      title: month.fullCoverage ? 'Pay for one month with credits' : `One month: ${fmtCredits(month.creditsApplied)} credits + ${fmtCredits(month.cashGross)} by card`,
      detail: month.fullCoverage
        ? `Uses ${fmtCredits(month.creditsApplied)} of your credits. No card needed, and it does not renew.`
        : 'One month only. It does not renew; you can subscribe before it ends to keep your place.',
    });
  }
  if (options.length === 1) return null;

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
