'use client';

// What a parent sees on a class page when one of their children already holds a
// Secure-your-spot place in it.
//
// The class page is built to sell a class to someone who is not in it, so a
// parent whose child was already secured — or whose paid month had run out —
// arrived at a plain "Enrol" CTA that said nothing about the month they had
// already bought. This is the missing sentence, and the button that acts on it.
//
// One panel per child: two siblings in the same class are two enrolments, two
// release dates and two separate payments, and a single combined prompt would
// be wrong for at least one of them.

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, CreditCard, Loader2 } from 'lucide-react';
import { fmtTTD } from '@/lib/utils/formatCurrency';

type ChildSpot = {
  enrolmentId: string;
  childId: string;
  childName: string;
  status: 'SECURED' | 'COMPLETED';
  releaseDate: string;
  shortClass: boolean;
  priceMonthly: number | null;
};

/** A bare YYYY-MM-DD read by `new Date` is UTC midnight, which renders as the
 *  evening before anywhere west of UTC. Parse it at local midnight instead. */
function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-TT', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function ParentSecureSpotBanner({
  groupId,
  /** Called after a state-changing action so the page can re-read the class. */
  onChanged,
}: {
  groupId: string;
  onChanged?: () => void;
}) {
  const [children, setChildren] = useState<ChildSpot[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/parent/classes/${groupId}/secure-spot`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setChildren(json.children ?? []);
    } catch {
      // Non-fatal and deliberately silent: this is an explanation on top of a
      // page that works without it. A failed fetch must not stop a parent
      // reading the class or enrolling a different child.
    }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  if (children.length === 0) return null;

  return (
    <div className="mb-3 space-y-3">
      {children.map((child) => (
        <ChildSpotPanel
          key={child.enrolmentId}
          groupId={groupId}
          child={child}
          onChanged={() => { void load(); onChanged?.(); }}
        />
      ))}
    </div>
  );
}

function ChildSpotPanel({
  groupId,
  child,
  onChanged,
}: {
  groupId: string;
  child: ChildSpot;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lapsed = child.status === 'COMPLETED';
  const endsAt = new Date(`${child.releaseDate}T23:59:59-04:00`).getTime();
  const daysLeft = Math.ceil((endsAt - Date.now()) / 86_400_000);
  // Same seven-day window as the student's prompt and the reminder cron, so a
  // parent and child are never asked and reassured on the same day.
  const asking = !lapsed && !child.shortClass && daysLeft <= 7;

  /**
   * Continue on the parent's card.
   *
   * The parent's own enrol endpoint rather than the student's: it proves the
   * link server-side and makes the parent the Stripe customer, so the receipt
   * goes to whoever is actually paying. The checkout behind it converts the
   * existing SECURED row instead of opening a second enrolment.
   */
  async function continueClass() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/parent/enroll-child/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId: child.childId, groupId }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.checkout_url) { window.location.href = json.checkout_url; return; }
      if (res.status === 202 && json.waitlisted) {
        // Only reachable on a lapsed place, whose seat went back to the pool
        // and was taken while they were away. Not an error — and not something
        // "try again" would fix.
        setError(
          `This class is full. ${child.childName} is on the waitlist${
            json.position ? ` at position ${json.position}` : ''
          }.`
        );
        onChanged();
        return;
      }
      setError(
        [json.error, json.detail].filter(Boolean).join(' — ') ||
          'Could not start the subscription. Please try again.'
      );
    } catch {
      setError('Could not start the subscription — check your connection.');
    } finally {
      setBusy(false);
    }
  }

  // Secured, still comfortably inside the paid month: reassurance only. No CTA
  // — asking this early is how a parent comes to believe a second month is
  // already on its way.
  if (!asking && !lapsed) {
    return (
      <div className="rounded-2xl border border-brand/30 bg-brand-soft/50 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-deep" />
          <div>
            <div className="text-sm font-bold text-ink">
              {child.childName}&apos;s spot is secured
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {child.shortClass
                ? <>You paid for this class in full — it runs until <strong className="text-ink">{fmtDate(child.releaseDate)}</strong> and there is nothing further to pay.</>
                : <>You paid for their first month up front, and it runs until <strong className="text-ink">{fmtDate(child.releaseDate)}</strong>. Nothing is charged automatically — we&apos;ll ask you before then whether to continue.</>}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 ${lapsed ? 'border-brand/30 bg-brand-soft/50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {lapsed
            ? <CreditCard className="mt-0.5 size-5 shrink-0 text-brand-deep" />
            : <Clock className="mt-0.5 size-5 shrink-0 text-amber-700" />}
          <div>
            <div className={`text-sm font-bold ${lapsed ? 'text-ink' : 'text-amber-900'}`}>
              {lapsed
                ? `${child.childName}'s place has ended`
                : daysLeft > 0
                  ? `${child.childName}'s paid month ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
                  : `${child.childName}'s paid month has ended`}
            </div>
            <p className={`mt-0.5 text-xs leading-relaxed ${lapsed ? 'text-muted-foreground' : 'text-amber-900'}`}>
              {lapsed
                ? <>You paid for the first month up front and nothing was charged after it, so the place was released on <strong className="text-ink">{fmtDate(child.releaseDate)}</strong>. Subscribe to put {child.childName} back in the class.</>
                : <>Their paid month runs to <strong>{fmtDate(child.releaseDate)}</strong>. Continue to keep the place{child.priceMonthly ? <> for {fmtTTD(child.priceMonthly)} a month</> : null} — cancel any time. If you do nothing, it simply ends.</>}
            </p>
            {error && <p className="mt-1 text-xs font-semibold text-rose-700">{error}</p>}
          </div>
        </div>
        <button
          onClick={continueClass}
          disabled={busy}
          className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 ${
            lapsed ? 'bg-brand hover:bg-brand-deep' : 'bg-ink hover:opacity-90'
          }`}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <CreditCard className="size-3.5" />}
          {busy ? 'Starting…' : lapsed ? 'Subscribe to continue' : 'Continue this class'}
        </button>
      </div>
    </div>
  );
}
