'use client';

// "Pay my next payment with credits" on a monthly subscription (scenario A).
// Credits pay the WHOLE renewal or nothing; the server refuses, with how much
// more is needed, when the balance falls short. Shows nothing for someone with
// no credits. States:
//   * credits already set to pay it → the amount, the date, and Remove
//   * a LuniPay-billed subscription → why credits cannot be used on it
//   * otherwise → the button

import { useState } from 'react';
import { Gift, Loader2 } from 'lucide-react';
import { fmtCredits, invalidateCredits, useCredits } from '@/lib/credits/useCredits';

function fmtDate(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' }) : 'your next payment';
}

export default function RenewalCreditsControl({
  enrollmentId,
  billingProvider,
  status,
  cancelling,
}: {
  enrollmentId: string;
  billingProvider: string | null | undefined;
  status: string;
  cancelling: boolean;
}) {
  const { data } = useCredits('lite');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  if (!data?.available || data.suspended) return null;
  const balance = data.wallet?.available ?? 0;
  const pending = data.renewals?.[enrollmentId];
  if (!pending && balance <= 0) return null;

  const live = (status === 'ACTIVE' || status === 'GRACE') && !cancelling;

  const call = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/subscriptions/${enrollmentId}/apply-credits`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({}) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: 'error', text: json?.error ?? 'Something went wrong. Please try again.' });
        return;
      }
      if (method === 'POST') {
        setMessage({
          tone: 'ok',
          text: `${fmtCredits(json.credits_applied)} in credits will pay your payment on ${fmtDate(json.applies_on)} — nothing will be charged to your card.`,
        });
      } else {
        setMessage({ tone: 'ok', text: 'Your credits are back in your wallet.' });
      }
      invalidateCredits();
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach iTutor. Check your connection.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-emerald-200 bg-brand-soft px-4 py-3 text-sm">
      {pending ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-ink">
            <Gift className="size-4 text-brand" />
            {fmtCredits(pending.credits)} in credits will pay your payment on {fmtDate(pending.applies_on)}.
          </span>
          <button
            type="button"
            onClick={() => void call('DELETE')}
            disabled={busy}
            className="text-xs font-semibold text-muted-foreground underline disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : billingProvider === 'lunipay' ? (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Gift className="size-4" /> Credits can’t be used on this subscription: it uses our previous payment method.
        </span>
      ) : billingProvider === 'stripe' && live ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-ink">
            <Gift className="size-4 text-brand" /> You have {fmtCredits(balance)} in credits.
          </span>
          <button
            type="button"
            onClick={() => void call('POST')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-deep transition disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Pay my next payment with credits
          </button>
        </div>
      ) : (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Gift className="size-4" /> Credits can pay the next payment of an active monthly card subscription.
        </span>
      )}
      {message ? (
        <p className={`mt-2 text-xs ${message.tone === 'ok' ? 'text-brand-deep' : 'text-red-600'}`}>{message.text}</p>
      ) : null}
    </div>
  );
}
