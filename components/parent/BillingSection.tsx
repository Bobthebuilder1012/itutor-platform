'use client';

// Billing, as a section INSIDE Settings — the design kit's placement.
//
// It is also the first surface able to call the payer pause/resume/cancel API
// from migration 227, which shipped with nothing able to reach it.
//
// TWO KINDS OF PAUSE, AND ONLY ONE IS THE PARENT'S
// A tutor break resumes automatically on its own date and a parent cannot end it
// early, so no Resume button is offered for one — instead it says who paused it
// and when it comes back. Offering a control that would fail is worse than
// offering none. A parent's own pause gets Resume.
//
// CANCEL OFFERS PAUSE FIRST
// Pausing keeps the place and the tutor; cancelling releases the place. A parent
// wanting a break in payments should not have to lose the seat to get one, so the
// cheaper option is put in front of the destructive one.
//
// The renewal DATE is shown, never a credit balance. A parent wants to know when
// money next leaves their account.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, PauseCircle, PlayCircle } from 'lucide-react';
import { fmtTTD } from '@/lib/utils/formatCurrency';

type Subscription = {
  id: string;
  childName: string;
  className: string;
  tutorName: string | null;
  amount: number;
  cancelled: boolean;
  cancelScheduled: boolean;
  paused: boolean;
  pausedByTutor: boolean;
  pauseEnds: string | null;
  nextCharge: string | null;
};

type Transaction = {
  id: string;
  childName: string;
  amount: number;
  status: string;
  date: string | null;
};

const CANCEL_REASONS = [
  'Too expensive',
  'Not using it enough',
  'Exams are over',
  'Switching tutor',
  'Not happy with the classes',
  'Something else',
];

export default function BillingSection() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Subscription | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/parent/billing', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setSubs(json.subscriptions ?? []);
      setTxns(json.transactions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: string, body: Record<string, unknown> = {}) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/parent/subscriptions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'That did not work.');
        return;
      }
      setNote(
        action === 'pause'
          ? 'Paused. No charges until you resume, and the place is kept.'
          : action === 'resume'
            ? 'Resumed. Charges restart on the original billing date.'
            : action === 'cancel'
              ? 'Cancelled. Classes already paid for stay on the calendar and the next charge will not be taken.'
              : 'Restarted.'
      );
      window.setTimeout(() => setNote(null), 8000);
      await load();
    } finally {
      setBusy(null);
      setCancelling(null);
      setReason(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {note && (
        <p className="rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-ink">{note}</p>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <section>
        <h3 className="text-sm font-bold text-ink">Subscriptions</h3>
        {subs.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No subscriptions yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {subs.map((s) => (
              <div key={s.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{s.className}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.childName}
                      {s.tutorName ? ` · ${s.tutorName}` : ''}
                    </div>

                    {s.cancelled ? (
                      <div className="mt-1 text-xs text-muted-foreground">Cancelled.</div>
                    ) : s.cancelScheduled ? (
                      <div className="mt-1 text-xs text-amber-700">
                        Ends after this month. No further charges.
                      </div>
                    ) : s.paused ? (
                      <div className="mt-1 text-xs text-amber-700">
                        {s.pausedByTutor
                          ? `On a tutor break${s.pauseEnds ? ` until ${s.pauseEnds}` : ''}. Your place is held and billing restarts on its own — nothing for you to do.`
                          : 'Paused by you. No charges until you resume, and the place is kept.'}
                        {s.nextCharge ? ` Next charge ${s.nextCharge}.` : ''}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {s.nextCharge ? `Next charge ${s.nextCharge}.` : 'Active.'}
                      </div>
                    )}
                  </div>

                  <div className="text-sm font-extrabold tabular-nums text-ink">
                    {fmtTTD(s.amount)}
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-2">
                  {s.cancelled ? null : s.cancelScheduled ? (
                    <button
                      onClick={() => act(s.id, 'restart')}
                      disabled={busy === s.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-60"
                    >
                      {busy === s.id && <Loader2 className="size-3 animate-spin" />}
                      Keep this class
                    </button>
                  ) : s.pausedByTutor ? (
                    // No Resume: a tutor break is not the parent's to end.
                    <span className="text-xs text-muted-foreground">
                      Only the tutor can change a class break.
                    </span>
                  ) : s.paused ? (
                    <button
                      onClick={() => act(s.id, 'resume')}
                      disabled={busy === s.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-60"
                    >
                      {busy === s.id ? <Loader2 className="size-3 animate-spin" /> : <PlayCircle className="size-3.5" />}
                      Resume
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => act(s.id, 'pause')}
                        disabled={busy === s.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-60"
                      >
                        {busy === s.id ? <Loader2 className="size-3 animate-spin" /> : <PauseCircle className="size-3.5" />}
                        Pause
                      </button>
                      <button
                        onClick={() => setCancelling(s)}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-bold text-ink">Transactions</h3>
        {txns.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <div className="mt-2 divide-y divide-border rounded-xl border border-border">
            {txns.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 p-3">
                <span className="text-xs text-muted-foreground">{t.date}</span>
                <span className="min-w-0 flex-1 text-sm text-ink">{t.childName}</span>
                <span className="text-sm font-semibold tabular-nums text-ink">
                  {fmtTTD(t.amount)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    t.status === 'Paid'
                      ? 'bg-brand/10 text-brand'
                      : t.status === 'Failed'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pause offered before cancel: a parent wanting a break in payments should
          not have to give up the seat to get one. */}
      {cancelling && (
        /* Scrolls, and aligns to the top on short screens. Centred with no
           overflow put the reason list and both buttons off-screen on a phone in
           landscape — the parent could see the modal and not reach "Cancel
           subscription" or "Keep subscription". */
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center">
          <div className="my-auto w-full max-w-md space-y-3 rounded-2xl border border-border bg-background p-5">
            <h3 className="text-base font-bold text-ink">Cancel {cancelling.className}?</h3>

            <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <div>
                <p className="text-sm font-semibold text-ink">Pause instead?</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pausing keeps {cancelling.childName.split(' ')[0]}&rsquo;s place and the same
                  tutor, and stops all charges until you resume. Cancelling releases the place.
                </p>
                <button
                  onClick={() => act(cancelling.id, 'pause')}
                  className="mt-2 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Pause instead
                </button>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-ink">Why are you cancelling?</p>
              <div className="mt-2 grid gap-1.5">
                {CANCEL_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                      reason === r ? 'border-brand bg-brand/5 text-ink' : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Classes already paid for stay on the calendar.
              {cancelling.nextCharge
                ? ` The next charge on ${cancelling.nextCharge} will not be taken.`
                : ' The next charge will not be taken.'}
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => act(cancelling.id, 'cancel', { reason })}
                disabled={!reason || busy === cancelling.id}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Cancel subscription
              </button>
              <button
                onClick={() => {
                  setCancelling(null);
                  setReason(null);
                }}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-ink"
              >
                Keep subscription
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
