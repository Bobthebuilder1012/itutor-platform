'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, CheckCircle, AlertCircle, Clock, RefreshCw, CalendarCheck2, GraduationCap, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import ParentShell from '@/components/parent/ParentShell';

type Sub = {
  id: string; student_id: string; student_name: string; group_id: string;
  status: string; payment_status: string; plan_price_ttd: number | null;
  current_period_end: string | null; next_payment_due_at: string | null;
  cancel_at_period_end: boolean; enrolled_at: string;
  /** Secure your spot only — the day the up-front first month runs to. */
  release_date: string | null;
  group: { name: string; subject: string | null; cover_image: string | null; end_date?: string | null } | null;
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * `release_date` is a bare YYYY-MM-DD. `new Date()` reads that as UTC midnight
 * and renders it in the viewer's zone, which west of UTC is the evening before
 * — a release date of the 24th was shown to a Trinidad parent as the 23rd.
 */
function fmtDateOnly(d: string | null) {
  if (!d) return '—';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-TT', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function ParentSubscriptionsPage() {
  return <ParentShell><SubscriptionsContent /></ParentShell>;
}

function SubscriptionsContent() {
  const { profile } = useProfile();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      // Get linked children
      const { data: links } = await supabase
        .from('parent_child_links')
        .select('child_id, child:profiles!parent_child_links_child_id_fkey(id, full_name, display_name)')
        .eq('parent_id', profile.id);

      if (!links?.length) { setLoading(false); return; }

      const childIds = links.map((l: any) => l.child_id);
      const childMap = new Map(links.map((l: any) => {
        const c = Array.isArray(l.child) ? l.child[0] : l.child;
        return [c.id, c?.display_name || c?.full_name || 'Child'];
      }));

      // Get subscriptions for all children
      const { data: enrollments } = await supabase
        .from('group_enrollments')
        .select(`
          id, student_id, group_id, status, payment_status, plan_price_ttd,
          current_period_end, next_payment_due_at, cancel_at_period_end, enrolled_at,
          release_date,
          group:groups!group_enrollments_group_id_fkey(name, subject, cover_image, end_date)
        `)
        .in('student_id', childIds)
        .eq('enrollment_type', 'SUBSCRIPTION')
        // COMPLETED is here for one case only: a secure-spot place whose paid
        // month ran out. Without it the class left this page the day it ended,
        // so the parent who paid for it had no record of it and no way back —
        // filtered to release_date below, since COMPLETED alone also covers
        // ordinary subscriptions that simply finished.
        .in('status', ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED', 'PENDING_PAYMENT', 'COMPLETED'])
        .order('enrolled_at', { ascending: false });

      setSubs((enrollments ?? [])
        // A COMPLETED row with no release_date is an ordinary subscription that
        // ran its course — it belongs in neither this list nor a continue prompt.
        .filter((e: any) => e.status !== 'COMPLETED' || !!e.release_date)
        .map((e: any) => ({
          ...e,
          student_name: childMap.get(e.student_id) ?? 'Child',
          group: Array.isArray(e.group) ? e.group[0] : e.group,
        })));
      setLoading(false);
    })();
  }, [profile?.id]);

  const active = subs.filter(s => s.status === 'ACTIVE');
  const other = subs.filter(s => s.status !== 'ACTIVE');

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Billing</div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink mt-1">Subscriptions</h1>
        <p className="text-sm text-muted-foreground mt-1">Active class subscriptions for all your children.</p>
      </div>

      {/* Stats */}
      {subs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Active" value={String(active.length)} tone="brand" />
          <StatCard label="Total spend/mo" value={active.reduce((n, s) => n + (s.plan_price_ttd ?? 0), 0) > 0 ? fmtTTD(active.reduce((n, s) => n + (s.plan_price_ttd ?? 0), 0)) : '—'} tone="brand" />
          <StatCard label="Children" value={String(new Set(subs.map(s => s.student_id)).size)} tone="muted" />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-32 rounded-2xl bg-muted animate-pulse"/>)}</div>
      ) : subs.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
          <div className="mx-auto size-12 rounded-2xl bg-brand-soft text-brand-deep grid place-items-center mb-4"><GraduationCap className="size-5"/></div>
          <h2 className="font-bold text-ink">No active subscriptions</h2>
          <p className="text-sm text-muted-foreground mt-1">Enroll a child in a class to see subscriptions here.</p>
          <Link href="/parent/classes" className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep">Find classes</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {[...active, ...other].map(sub => <SubCard key={sub.id} sub={sub} />)}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: 'brand' | 'muted' }) {
  return (
    <div className={cn('rounded-2xl border p-4', tone === 'brand' ? 'bg-brand-soft border-brand/20' : 'bg-background border-border')}>
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
      <div className={cn('text-2xl font-bold mt-1', tone === 'brand' ? 'text-brand-deep' : 'text-ink')}>{value}</div>
    </div>
  );
}

function SubCard({ sub }: { sub: Sub }) {
  const statusMap: Record<string, { label: string; icon: any; cls: string }> = {
    ACTIVE:          { label: 'Active',          icon: CheckCircle, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    GRACE:           { label: 'Grace period',    icon: Clock,       cls: 'text-amber-700 bg-amber-50 border-amber-200' },
    SUSPENDED:       { label: 'Suspended',       icon: AlertCircle, cls: 'text-rose-700 bg-rose-50 border-rose-200' },
    PENDING_PAYMENT: { label: 'Payment pending', icon: CreditCard,  cls: 'text-sky-700 bg-sky-50 border-sky-200' },
    SECURED:         { label: 'Spot secured',    icon: CheckCircle, cls: 'text-brand-deep bg-brand-soft border-brand/30' },
    COMPLETED:       { label: 'Month ended',     icon: CreditCard,  cls: 'text-zinc-700 bg-zinc-50 border-zinc-200' },
  };

  // ── Secure your spot, from the payer's side ────────────────────────────
  //
  // This page only ever listed a secured place as another subscription, and
  // dropped it entirely once it lapsed. But payer_id on a preordered enrolment
  // is usually the PARENT: the person who paid the first month had no continue
  // button anywhere in the product, while their child's student page had one.
  const isSecured = sub.status === 'SECURED';
  const isLapsed  = sub.status === 'COMPLETED' && !!sub.release_date;
  const releaseAt = sub.release_date
    ? new Date(`${sub.release_date}T23:59:59-04:00`).getTime()
    : null;
  const daysLeft  = releaseAt ? Math.ceil((releaseAt - Date.now()) / 86_400_000) : null;
  // A class finishing inside the paid month was bought outright. Never prompt.
  const shortClass = !!(
    sub.group?.end_date && sub.release_date && sub.group.end_date <= sub.release_date
  );
  const asking = isSecured && !shortClass && daysLeft !== null && daysLeft <= 7;

  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);

  /**
   * Continue the child's place on the parent's card.
   *
   * The parent's own enrol endpoint, not the student's: it proves the link
   * with requireParentChild and sets the Stripe customer to the parent, so the
   * receipt reaches the cardholder rather than a minor. The checkout behind it
   * is the same one the student's "Continue" uses, and converts the existing
   * SECURED row rather than opening a second enrolment.
   */
  async function continueForChild() {
    setContinuing(true);
    setContinueError(null);
    try {
      const res = await fetch('/api/parent/enroll-child/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId: sub.student_id, groupId: sub.group_id }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.checkout_url) { window.location.href = json.checkout_url; return; }
      setContinueError(
        [json.error, json.detail].filter(Boolean).join(' — ') ||
          'Could not start the subscription. Please try again.'
      );
    } catch {
      setContinueError('Could not start the subscription — check your connection.');
    } finally {
      setContinuing(false);
    }
  }

  const sm = statusMap[sub.status] ?? statusMap.ACTIVE;
  const Icon = sm.icon;

  return (
    <div className={cn('rounded-2xl border p-5 space-y-3', sm.cls)}>
      <div className="flex items-start gap-3">
        <div className="size-12 rounded-2xl bg-white/80 grid place-items-center text-2xl shadow-sm shrink-0">📚</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-ink truncate">{sub.group?.name ?? 'Class'}</h3>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/80 shrink-0">
              <Icon className="size-3"/> {sm.label}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{sub.group?.subject} · for {sub.student_name}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <InfoItem icon={<CreditCard className="size-3.5"/>} label="Plan" value={sub.plan_price_ttd ? `${fmtTTD(sub.plan_price_ttd)}/mo` : 'Free'} />
        {isSecured || isLapsed ? (
          <InfoItem
            icon={<CalendarCheck2 className="size-3.5"/>}
            label={shortClass ? 'Class runs to' : isLapsed ? 'First month ran to' : 'First month ends'}
            value={fmtDateOnly(sub.release_date)}
          />
        ) : (
          <InfoItem icon={<CalendarCheck2 className="size-3.5"/>} label="Period ends" value={fmtDate(sub.current_period_end)} />
        )}
        <InfoItem
          icon={<RefreshCw className="size-3.5"/>}
          label="Next payment"
          value={
            isSecured || isLapsed
              // The single most important fact about a preorder, and the one a
              // parent is most likely to assume the other way round.
              ? 'None — nothing renews'
              : sub.cancel_at_period_end ? 'Cancelling' : fmtDate(sub.next_payment_due_at)
          }
        />
      </div>
      {sub.cancel_at_period_end && (
        <div className="text-xs text-amber-700 font-medium">Cancelling at end of current period · {fmtDate(sub.current_period_end)}</div>
      )}

      {isSecured && !asking && (
        <div className="text-xs text-brand-deep">
          {shortClass
            ? <>Paid in full — there is nothing further to pay for this class.</>
            : <>{sub.student_name}&apos;s place is paid through {fmtDateOnly(sub.release_date)}. Nothing is charged automatically — we&apos;ll ask you before then.</>}
        </div>
      )}

      {(asking || isLapsed) && (
        <div className="space-y-2 rounded-xl border border-brand/30 bg-white/70 p-3">
          <div className="text-xs font-semibold text-ink">
            {isLapsed
              ? `${sub.student_name}'s place has ended`
              : daysLeft !== null && daysLeft > 0
                ? `${sub.student_name}'s paid month ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
                : `${sub.student_name}'s paid month has ended`}
          </div>
          <p className="text-xs text-muted-foreground">
            {isLapsed
              ? <>You paid for the first month up front and nothing was charged after it, so the place was released on {fmtDateOnly(sub.release_date)}. Subscribe to put {sub.student_name} back in the class.</>
              : <>You paid for the first month up front when the spot was secured. To keep the place, start the monthly subscription{sub.plan_price_ttd ? <> at {fmtTTD(sub.plan_price_ttd)} a month</> : null} — cancel any time. If you do nothing, it simply ends.</>}
          </p>
          <button
            onClick={continueForChild}
            disabled={continuing}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-deep disabled:opacity-60"
          >
            {continuing ? <Loader2 className="size-3.5 animate-spin" /> : <CreditCard className="size-3.5" />}
            {continuing ? 'Starting…' : isLapsed ? 'Subscribe to continue' : 'Continue this class'}
          </button>
          {continueError && <p className="text-xs font-semibold text-rose-700">{continueError}</p>}
        </div>
      )}
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{icon} {label}</div>
      <div className="text-sm font-medium text-ink mt-0.5">{value}</div>
    </div>
  );
}
