'use client';

// "What needs your attention" — handover §9.1.
//
// The kit makes this the one dominant element on the dashboard, and the reason is
// §4.2: a pending approval closes two hours before the session and sends NO email
// when it lapses. If a parent has to hunt for it, the default outcome is that
// nobody answers and the child quietly loses the place.
//
// EXACTLY THREE KINDS, AND NOTHING ELSE GETS IN
// Pending approvals, payment failures, new feedback. Parents get no session
// reminders (§22), no digest (§21) and no attendance alerts (§6), so putting
// anything else here would advertise a channel that does not exist — and a card
// that cries wolf stops being read, which costs exactly the approval this exists
// to surface.
//
// Approvals sort first because they are the only items with a deadline. The
// closing time travels with each one, never as a single line at the top: a parent
// scanning three requests needs to know which of them shuts tonight.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BellRing, CalendarCheck, CreditCard, MessageSquareQuote } from 'lucide-react';

type Item = {
  kind: 'approval' | 'payment' | 'feedback';
  id: string;
  childName: string | null;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  closesAt?: string | null;
};

const TONE: Record<Item['kind'], { wrap: string; icon: React.ReactNode }> = {
  approval: {
    wrap: 'border-amber-300 bg-amber-50',
    icon: <CalendarCheck className="size-4 text-amber-700" />,
  },
  payment: {
    wrap: 'border-rose-300 bg-rose-50',
    icon: <CreditCard className="size-4 text-rose-700" />,
  },
  feedback: {
    wrap: 'border-fuchsia-300 bg-fuchsia-50',
    icon: <MessageSquareQuote className="size-4 text-fuchsia-700" />,
  },
};

export default function AttentionCard({ nextClassLine }: { nextClassLine?: string | null }) {
  const [items, setItems] = useState<Item[]>([]);
  const [hasChildren, setHasChildren] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/parent/attention', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setItems(json.items ?? []);
      setHasChildren(Boolean(json.hasChildren));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // No children yet: the dashboard's own empty state already covers that, and a
  // second empty box beneath it would just be noise.
  if (!loaded || !hasChildren) return null;

  const count = items.length;

  return (
    <section className="rounded-2xl border border-border bg-background p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 sm:size-10">
          <BellRing className="size-4 sm:size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink sm:text-lg">What needs your attention</h2>
          <p className="text-xs text-muted-foreground">
            {count === 0 ? 'Nothing waiting on you.' : `${count} ${count === 1 ? 'item' : 'items'}`}
          </p>
        </div>
      </div>

      {count === 0 ? (
        <div className="mt-3 flex items-start gap-2.5 border-t border-border pt-3">
          <CalendarCheck className="mt-0.5 size-4 shrink-0 text-brand" />
          <p className="text-sm text-muted-foreground">
            {nextClassLine ?? 'Nothing needs you right now.'}
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          {items.map((item) => {
            const tone = TONE[item.kind];
            return (
              <div
                key={`${item.kind}:${item.id}`}
                className={`rounded-xl border p-3 ${tone.wrap}`}
              >
                <div className="flex flex-wrap items-start gap-2">
                  <span className="mt-0.5 shrink-0">{tone.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{item.title}</div>
                    <div className="mt-0.5 text-xs text-ink/70">{item.detail}</div>

                    {/* Per item, not per card. Which of these shuts tonight? */}
                    {item.kind === 'approval' && item.closesAt && (
                      <div className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-900">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                        <span>
                          No place is held. Closes {item.closesAt}, two hours before the class.
                        </span>
                      </div>
                    )}
                  </div>

                  <Link
                    href={item.href}
                    className="shrink-0 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white hover:bg-ink/90"
                  >
                    {item.actionLabel}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
