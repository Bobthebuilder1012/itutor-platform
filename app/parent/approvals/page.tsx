'use client';

// Parent approvals queue — handover §9.1, and the surface §4.4 acts from.
//
// THE ONE THING THIS SCREEN MUST NOT DO
// Imply that a place is held. Statement 3: nothing is reserved while a parent
// decides, first to pay wins, and the window shuts two hours before the
// session. A parent who assumes otherwise and loses the place reads it as a
// bug, so both halves of that warning — not reserved, AND closes at a stated
// time — appear together on every request, not once at the top of the page.
//
// The price is labelled "as listed when requested" wherever it appears
// (decision 10). The tutor may have changed their rate since the child asked;
// the parent is agreeing to the figure their child was shown.
//
// Checkout returns here (§4.4 success_url/cancel_url), so the five states of
// §9.1 are read off the query string on arrival.

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Clock, Loader2, ShieldCheck, X } from 'lucide-react';
import ParentShell from '@/components/parent/ParentShell';
import { fmtTTD } from '@/lib/utils/formatCurrency';

type PendingRequest = {
  id: string;
  childId: string;
  childName: string;
  tutorName: string;
  tutorAvatar: string | null;
  when: string;
  minutes: number;
  priceWhenRequested: number;
  isFree: boolean;
  requestedAt: string | null;
  closesAt: string | null;
  closed: boolean;
};

type DecidedRequest = {
  id: string;
  childName: string;
  tutorName: string;
  decision: 'Approved' | 'Declined' | 'Expired' | 'Withdrawn';
  total: number;
  at: string | null;
  reason: string | null;
  note: string | null;
};

export default function ParentApprovalsPage() {
  return (
    <ParentShell>
      <ApprovalsContent />
    </ParentShell>
  );
}

function ApprovalsContent() {
  const params = useSearchParams();
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [decided, setDecided] = useState<DecidedRequest[]>([]);
  const [hasChildren, setHasChildren] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/parent/approvals', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not load your requests');
      setPending(json.pending ?? []);
      setDecided(json.decided ?? []);
      setHasChildren(Boolean(json.hasChildren));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // §9.1's checkout states. Stripe sends the parent back here, so the outcome is
  // reported on the surface they already know rather than a dead-end page.
  useEffect(() => {
    const checkout = params.get('checkout');
    if (!checkout) return;
    if (checkout === 'success') {
      setToast(
        'Payment received. Your child is enrolled once it clears — we email them, not you, when it does.'
      );
    } else if (checkout === 'cancelled') {
      setToast('Payment not completed. Nothing was charged and the request is still waiting for you.');
    }
  }, [params]);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 6000);
  };

  const approve = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/parent/approvals/${id}/approve`, { method: 'POST' });
      const json = await res.json();

      if (!res.ok) {
        // The two refusals a parent can actually hit, phrased as what happened
        // rather than as an error code.
        setError(
          json.message ??
            (json.error === 'expired'
              ? 'This request closed two hours before the session.'
              : 'That could not be approved.')
        );
        await load();
        return;
      }

      if (json.free) {
        flash(json.message ?? 'Approved. No payment was involved.');
        await load();
        return;
      }

      // Hosted Checkout (decision 3). iTutor never sees the card.
      if (json.checkoutUrl) window.location.href = json.checkoutUrl as string;
    } catch {
      setError('Something went wrong. Nothing was charged.');
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/parent/approvals/${id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error === 'expired' ? 'This request already closed.' : 'Could not decline that.');
      } else {
        flash(json.message ?? 'Declined.');
      }
      setDecliningId(null);
      setReason('');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Booking requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          No place is held while you decide. Each request closes two hours before its class starts.
        </p>
      </header>

      {toast && (
        <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-ink">
          {toast}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!hasChildren && (
        <div className="rounded-2xl border border-border bg-background p-6">
          <p className="text-sm text-ink">No children are linked to your account yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Once a child accepts your invite, their class requests arrive here first.
          </p>
        </div>
      )}

      {hasChildren && pending.length === 0 && (
        <div className="rounded-2xl border border-border bg-background p-6">
          <ShieldCheck className="h-8 w-8 text-brand" />
          <p className="mt-3 text-sm text-ink">Nothing is waiting on you.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When your child asks to join a class, it comes here before anything is paid.
          </p>
        </div>
      )}

      {pending.map((r) => (
        <article key={r.id} className="rounded-2xl border border-border bg-background p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-ink">{r.childName} wants to join</div>
            {r.closesAt && (
              <span
                className={
                  r.closed
                    ? 'inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600'
                    : 'inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700'
                }
              >
                <Clock className="h-3.5 w-3.5" />
                {r.closed ? 'Closed' : `Closes ${r.closesAt}`}
              </span>
            )}
          </div>

          <h2 className="mt-2 text-lg font-bold text-ink">{r.tutorName}</h2>
          <p className="text-sm text-muted-foreground">
            {r.when} · {r.minutes} min
          </p>

          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Price as listed when requested
            </div>
            <div className="text-2xl font-extrabold tabular-nums text-ink">
              {r.isFree ? 'Free' : fmtTTD(r.priceWhenRequested)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.isFree
                ? 'No payment is involved. You are approving the enrolment itself.'
                : 'The tutor’s current price may differ.'}
            </p>
          </div>

          {/* Both halves, together. Never one without the other. */}
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p className="text-xs leading-relaxed text-amber-900">
              <strong>This spot is not reserved.</strong> Another student can take the last place
              while this sits here.
              {r.closesAt ? ` The request closes ${r.closesAt}, two hours before the class starts.` : ''}
            </p>
          </div>

          {r.closed ? (
            <p className="mt-4 text-xs text-muted-foreground">
              This request closed before it was answered, so it can no longer be approved.
            </p>
          ) : decliningId === r.id ? (
            <div className="mt-4 space-y-2">
              <label className="block text-xs font-medium text-muted-foreground" htmlFor={`reason-${r.id}`}>
                Reason (optional — sent to your child word for word)
              </label>
              <input
                id={`reason-${r.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Clashes with football practice — try Saturdays."
                className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-ink placeholder:text-muted-foreground focus:border-brand focus:outline-none"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => decline(r.id)}
                  disabled={busyId === r.id}
                  className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-60"
                >
                  {busyId === r.id ? 'Sending…' : 'Send decline'}
                </button>
                <button
                  onClick={() => {
                    setDecliningId(null);
                    setReason('');
                  }}
                  className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-ink"
                >
                  Keep pending
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => approve(r.id)}
                disabled={busyId === r.id}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-60"
              >
                {busyId === r.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {r.isFree ? 'Approve enrolment' : `Approve & pay ${fmtTTD(r.priceWhenRequested)}`}
              </button>
              <button
                onClick={() => setDecliningId(r.id)}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-ink"
              >
                <X className="h-4 w-4" />
                Decline
              </button>
              <span className="text-xs text-muted-foreground">
                {r.isFree ? 'Confirms on the spot — no payment page.' : 'Continues to Stripe.'}
              </span>
            </div>
          )}
        </article>
      ))}

      {/* Past decisions carries expiry and withdrawal because no email is sent
          for either — this list is the only place they ever surface. */}
      {decided.length > 0 && (
        <section className="rounded-2xl border border-border bg-background p-5">
          <h2 className="text-base font-bold text-ink">Past decisions</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Approved, declined, expired and withdrawn.</p>
          <ul className="mt-3 divide-y divide-border">
            {decided.map((d) => (
              <li key={d.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 text-sm text-ink">
                    {d.childName} · {d.tutorName}
                  </span>
                  {d.at && <span className="text-xs text-muted-foreground">{d.at}</span>}
                  <span className={badgeClass(d.decision)}>{d.decision}</span>
                </div>
                {d.reason && (
                  <p className="mt-1 text-xs text-muted-foreground">Reason sent: “{d.reason}”</p>
                )}
                {d.note && <p className="mt-1 text-xs text-muted-foreground">{d.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function badgeClass(decision: DecidedRequest['decision']): string {
  const base = 'rounded-full px-2.5 py-0.5 text-[11px] font-bold';
  switch (decision) {
    case 'Approved':
      return `${base} bg-brand/15 text-brand`;
    case 'Declined':
      return `${base} bg-muted text-muted-foreground`;
    case 'Expired':
      return `${base} bg-amber-500/15 text-amber-700`;
    default:
      return `${base} bg-muted text-muted-foreground`;
  }
}
