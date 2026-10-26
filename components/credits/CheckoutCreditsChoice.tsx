'use client';

// "Use your credits" on a class's join flow. Two choices:
//
//   none       pay by card as usual
//   one_month  one month only, paid with credits (scenario B), with a card
//              covering the remainder when the credits fall short. Never
//              renews; the student is invited to subscribe before it ends.
//
// THERE IS NO THIRD OPTION, AND THERE MUST NOT BE. Credits off the first
// month of a SUBSCRIPTION — scenario C — was offered here until 2026-10-26
// and did nothing at all: no caller ever read the choice, so the student was
// charged the full price by card and kept credits they had just been told
// were being spent. It is not merely restored-and-broken, it is unwanted:
// credits must never start a subscription (owner's rule). Spending credits
// is a one-off month, and continuing afterwards is a decision taken at the
// full price.
//
// Renders nothing for someone with no spendable credits, and the figures
// shown are exact.

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
    (async () => {
      // Scenario B only. C was asked for here too, purely to label an option
      // that did nothing — a wasted round trip on every class page.
      const b = await fetch(
        `/api/credits/quote?groupId=${encodeURIComponent(groupId)}&scenario=B`,
        { cache: 'no-store' }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (cancelled) return;
      setMonth(b?.available ? (b.quote as CreditQuote) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, balance]);

  if (balance <= 0) return null;

  const options: Array<{ v: CreditChoice; title: string; detail: string; disabled?: boolean }> = [
    { v: 'none', title: 'Pay by card', detail: 'Keep your credits for later.' },
  ];
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
