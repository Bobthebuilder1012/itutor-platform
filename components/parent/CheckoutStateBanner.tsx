'use client';

// The five checkout states — §9.1.
//
// pre-redirect · success · cancelled · payment-failed · seat-taken-during-checkout
//
// THE TWO THAT MATTER MOST ARE THE TWO NOBODY TESTS
// payment-failed and seat-taken are decided in the webhook, after the redirect.
// The state therefore comes from the booking row rather than the query string, so
// a parent bounced to success_url whose card then failed is not shown "paid".
//
// SEAT-TAKEN IS NOT AN ERROR AIMED AT THE PARENT
// §4.5: the place went while they were paying, the refund is automatic, and
// "There is nothing for you to do." This is the one failure the platform caused,
// so the copy must not read like a task — no retry button, no "action required",
// and the refund stated as already happening rather than as something they must
// chase.
//
// payment-failed says the opposite thing just as plainly: the child is NOT
// enrolled and the place is open to others. A parent who thinks a declined card
// merely delays things will not act on it.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeftCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  Users,
} from 'lucide-react';
import { fmtTTD } from '@/lib/utils/formatCurrency';

type State = 'pre' | 'success' | 'cancelled' | 'failed' | 'seat_taken' | 'expired' | 'unknown';

type Status = { state: State; childName: string; amount: number; bookingId: string };

export default function CheckoutStateBanner({
  bookingId,
  hint,
  onDismiss,
}: {
  bookingId: string;
  /** How they arrived: Stripe's success_url or cancel_url. Only a hint. */
  hint?: string | null;
  onDismiss?: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/parent/approvals/${bookingId}/status${hint ? `?hint=${encodeURIComponent(hint)}` : ''}`,
        { cache: 'no-store' }
      );
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, [bookingId, hint]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Checking your payment…
      </div>
    );
  }

  if (!status || status.state === 'unknown') return null;

  const first = status.childName.split(' ')[0];
  const money = fmtTTD(status.amount);

  const view = {
    pre: {
      wrap: 'border-border bg-background',
      icon: <CreditCard className="size-5 text-muted-foreground" />,
      title: 'This request is still waiting for you',
      body: 'Nothing has been charged. Approving continues to Stripe’s secure page — iTutor never sees your card details.',
      actions: null,
    },
    success: {
      wrap: 'border-brand/40 bg-brand/10',
      icon: <CheckCircle2 className="size-5 text-brand" />,
      title: `${first} is enrolled`,
      body: `${money} paid. We email ${first}, not you, when the place is confirmed — so they hear it from us rather than from you.`,
      actions: (
        <Link
          href="/parent/dashboard"
          className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-ink"
        >
          Back to dashboard
        </Link>
      ),
    },
    cancelled: {
      wrap: 'border-border bg-muted/40',
      icon: <ArrowLeftCircle className="size-5 text-muted-foreground" />,
      title: 'Payment not completed',
      body: 'You left Stripe before finishing. Nothing was charged and the request is still waiting for you — but the place is still not held, and it still closes two hours before the class.',
      actions: null,
    },
    failed: {
      wrap: 'border-rose-300 bg-rose-50',
      icon: <AlertTriangle className="size-5 text-rose-700" />,
      title: 'Your card was declined',
      // Blunt on purpose: a parent who thinks this merely delays things will not act.
      body: `${money} was not taken. ${first} is not enrolled, and no place is held while this is outstanding — another student can take it. Retrying with the same card usually works if the decline was a limit.`,
      actions: (
        <Link
          href="/parent/approvals"
          className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white"
        >
          Retry payment
        </Link>
      ),
    },
    seat_taken: {
      wrap: 'border-amber-300 bg-amber-50',
      icon: <Users className="size-5 text-amber-700" />,
      title: 'The last place went while you were paying',
      // §4.5. No retry action, and the refund stated as already in motion — this
      // is the platform's failure, not a task for the parent.
      body: `The class filled before your payment finished, so ${first} could not be enrolled. The ${money} is being refunded automatically and usually lands within five working days. There is nothing for you to do.`,
      actions: (
        <Link
          href="/parent/classes"
          className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-ink"
        >
          Find another class
        </Link>
      ),
    },
    expired: {
      wrap: 'border-border bg-muted/40',
      icon: <Clock className="size-5 text-muted-foreground" />,
      title: 'This request closed',
      body: `It closed two hours before the session without being answered, and the place went to another student. Nothing was charged.`,
      actions: null,
    },
  }[status.state];

  return (
    <div className={`rounded-2xl border p-4 ${view.wrap}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 shrink-0">{view.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink">{view.title}</div>
          <p className="mt-1 text-sm leading-relaxed text-ink/75">{view.body}</p>
          {view.actions && <div className="mt-3 flex flex-wrap gap-2">{view.actions}</div>}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-ink"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
