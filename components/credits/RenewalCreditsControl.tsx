'use client';

// "Apply credits to my next payment" on a monthly subscription (scenario A).
// Shows nothing for someone with no credits. States:
//   * credits already set to apply → the amount, the date, and Remove
//   * a LuniPay-billed subscription → why credits cannot be used on it
//   * otherwise → Apply, which attaches the credits to the next renewal

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
          text: json.full_coverage
            ? `${fmtCredits(json.credits_applied)} will cover your payment on ${fmtDate(json.applies_on)} — nothing will be charged.`
            : `${fmtCredits(json.credits_applied)} will come off your payment on ${fmtDate(json.applies_on)}. Your card pays ${fmtCredits(json.card_charge)}.`,
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
    <div className="rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm">
      {pending ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-ink">
            <Gift className="size-4 text-brand" />
            {fmtCredits(pending.credits)} in credits will apply to your payment on {fmtDate(pending.applies_on)}.
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
            Apply credits to my next payment
          </button>
        </div>
      ) : (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Gift className="size-4" /> Credits can be applied to an active monthly card subscription.
        </span>
      )}
      {message ? (
        <p className={`mt-2 text-xs ${message.tone === 'ok' ? 'text-brand-deep' : 'text-red-600'}`}>{message.text}</p>
      ) : null}
    </div>
  );
}
