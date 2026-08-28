'use client';

// The student's "waiting on your parent" section — handover §9.2.
//
// Self-contained on purpose: it fetches its own data and renders nothing at all
// when there is nothing to show, so it can be dropped into My Classes without
// touching how that page loads or lays out its own lessons.
//
// TWO THINGS THIS COMPONENT EXISTS TO SAY
//
// 1. The spot is not reserved (statement 3). A dependent student's request holds
//    nothing, and someone else can take the last place while they wait. Saying
//    it once, plainly, at the point of waiting is the only honest option — the
//    alternative is a student who believes they are enrolled.
//
// 2. It closed, and nobody answered (§4.2). No email is sent on expiry, so if
//    this section does not show the expired state the student never learns; they
//    just wait for a class that is not coming. That is why expired rows are
//    rendered rather than filtered out.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { fmtTTD } from '@/lib/utils/formatCurrency';

type PendingItem = {
  id: string;
  tutorName: string;
  when: string;
  minutes: number;
  priceWhenRequested: number;
  isFree: boolean;
  requestedAt: string | null;
  closesAt: string | null;
  closed: boolean;
};

type OutcomeItem = {
  id: string;
  tutorName: string;
  status: string;
  at: string | null;
  reason: string | null;
};

export default function PendingRequestsSection() {
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeItem[]>([]);
  const [parentName, setParentName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/bookings/my-requests', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setPending(json.pending ?? []);
      setOutcomes(json.outcomes ?? []);
      setParentName(json.parentName ?? null);
    } catch {
      // Silent: this is an additional section, not the page. A student with no
      // parent linked has nothing here anyway.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const withdraw = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/bookings/${id}/withdraw`, { method: 'POST' });
      if (res.ok) {
        setNote('Withdrawn — it has been removed from your parent’s queue.');
        window.setTimeout(() => setNote(null), 5000);
        await load();
      } else {
        setNote('That could not be withdrawn. Refresh and try again.');
      }
    } finally {
      setBusyId(null);
    }
  };

  // Render nothing until we know, and nothing if there is nothing. A student who
  // pays for their own classes should never see an empty box about approvals.
  if (!loaded || (pending.length === 0 && outcomes.length === 0)) return null;

  const whoDecides = parentName ?? 'your parent';
  const firstName = parentName ? parentName.split(' ')[0] : 'your parent';

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-bold text-ink tracking-tight">Waiting on {firstName}</h2>
        {pending.length > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-600">
            {pending.length} pending
          </span>
        )}
      </div>

      {note && (
        <div className="rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 text-sm text-ink">
          {note}
        </div>
      )}

      {pending.map((r) => (
        <article
          key={r.id}
          className={`rounded-2xl border p-4 ${
            r.closed ? 'border-border bg-muted/30' : 'border-amber-500/30 bg-amber-500/5'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-ink">{r.tutorName}</span>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                r.closed ? 'text-muted-foreground' : 'text-amber-600'
              }`}
            >
              <Clock className="size-3.5" />
              {r.closed ? 'Closed' : r.closesAt ? `Closes ${r.closesAt}` : 'Awaiting approval'}
            </span>
          </div>

          <p className="mt-0.5 text-xs text-muted-foreground">
            {r.when} · {r.minutes} min
            {r.requestedAt ? ` · asked ${r.requestedAt}` : ''}
          </p>

          <p className="mt-2 text-sm text-ink">
            {r.isFree ? (
              <>Free class — {whoDecides} still has to approve the enrolment.</>
            ) : (
              <>
                <span className="font-semibold">{fmtTTD(r.priceWhenRequested)}</span>{' '}
                <span className="text-muted-foreground">as listed when you asked</span> —{' '}
                {whoDecides} will be asked to pay this.
              </>
            )}
          </p>

          {r.closed ? (
            /* §4.2: no email was sent, so this line is how the student finds out. */
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              This closed two hours before the class without being answered, and the place went to
              another student. Ask again if you still want it.
            </p>
          ) : (
            <>
              <div className="mt-2 flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                <p className="text-xs leading-relaxed text-amber-700">
                  <strong>This spot isn’t reserved until {firstName} pays.</strong> Someone else can
                  take the last place while you wait.
                </p>
              </div>

              {/* Decision 28 — the student can clear it from the parent's queue. */}
              <button
                onClick={() => withdraw(r.id)}
                disabled={busyId === r.id}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold text-ink transition hover:bg-muted disabled:opacity-60"
              >
                {busyId === r.id && <Loader2 className="size-3.5 animate-spin" />}
                Withdraw request
              </button>
            </>
          )}
        </article>
      ))}

      {outcomes.map((o) => (
        <article key={o.id} className="rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink">{o.tutorName}</span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
              {outcomeLabel(o.status)}
            </span>
          </div>
          {o.at && <p className="mt-0.5 text-xs text-muted-foreground">{o.at}</p>}
          {/* Verbatim, as typed by the parent. Rendered as text. */}
          {o.reason && (
            <p className="mt-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
              “{o.reason}”
            </p>
          )}
          {o.status === 'EXPIRED' && (
            <p className="mt-2 text-xs text-muted-foreground">
              Closed unanswered two hours before the class.
            </p>
          )}
          {o.status === 'SEAT_UNAVAILABLE_REFUNDED' && (
            <p className="mt-2 text-xs text-muted-foreground">
              The class filled while payment was going through. The money was refunded
              automatically — there is nothing for you to do.
            </p>
          )}
        </article>
      ))}
    </section>
  );
}

function outcomeLabel(status: string): string {
  switch (status) {
    case 'PARENT_REJECTED':
      return 'Declined';
    case 'EXPIRED':
      return 'Expired';
    case 'SEAT_UNAVAILABLE_REFUNDED':
      return 'Place taken · refunded';
    default:
      return status;
  }
}
