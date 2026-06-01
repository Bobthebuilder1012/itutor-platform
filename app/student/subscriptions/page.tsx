'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CreditCard, CheckCircle, AlertCircle, Ban, X, Loader2,
  RefreshCw, CalendarCheck2, Play, Sparkles, TrendingUp, Clock, Star, LifeBuoy,
} from 'lucide-react';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { cn } from '@/lib/utils';

type Subscription = {
  id: string;
  group_id: string;
  status: string;
  payment_status: string;
  plan_price_ttd: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_payment_due_at: string | null;
  grace_period_ends_at: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  last_paid_at: string | null;
  pending_payment_expires_at: string | null;
  enrolled_at: string;
  next_cycle_paid: boolean;
  group: {
    id: string;
    name: string;
    cover_image: string | null;
    subject: string | null;
    tutor: { full_name: string | null; avatar_url: string | null } | null;
  } | null;
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShort(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-TT', { day: 'numeric', month: 'short' });
}

function fmtShortYear(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.toLocaleDateString('en-TT', { day: 'numeric', month: 'short' })} ${dt.getFullYear()}`;
}

function daysLeft(d: string | null): number {
  if (!d) return 0;
  return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000));
}

// Progress is measured from last_paid_at → current_period_end
function cycleProgress(lastPaid: string | null, periodEnd: string | null): number {
  if (!lastPaid || !periodEnd) return 0;
  const s = new Date(lastPaid).getTime();
  const e = new Date(periodEnd).getTime();
  const now = Date.now();
  if (now <= s) return 0;
  if (now >= e) return 100;
  return Math.round(((now - s) / (e - s)) * 100);
}

function CancelModal({ sub, onClose, onConfirm, loading }: {
  sub: Subscription; onClose: () => void; onConfirm: () => void; loading: boolean;
}) {
  const groupName = sub.group?.name ?? 'this class';
  const accessUntil = fmtDate(sub.current_period_end);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-background rounded-2xl shadow-2xl border border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink">Cancel subscription?</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{groupName}</p>
            </div>
            <button onClick={onClose} className="size-8 rounded-full hover:bg-muted flex items-center justify-center shrink-0">
              <X className="size-4" />
            </button>
          </div>
          <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-3 text-sm">
            <p className="font-semibold text-ink">Cancellation policy</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle className="size-4 text-brand shrink-0 mt-0.5" />
                <span>You keep <strong className="text-ink">full access</strong> until <strong className="text-ink">{accessUntil}</strong>.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="size-4 text-brand shrink-0 mt-0.5" />
                <span>No future charges. You will <strong className="text-ink">not be billed</strong> for the next cycle.</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertCircle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                <span>Cancellations are <strong className="text-ink">not refunded</strong> for the current billing period.</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertCircle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                <span>You can <strong className="text-ink">undo this</strong> before {accessUntil}.</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="px-6 pb-6 flex flex-col sm:flex-row gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-ink hover:bg-muted transition">
            Keep subscription
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60 inline-flex items-center justify-center gap-2">
            {loading && <Loader2 className="size-4 animate-spin" />}
            Confirm cancellation
          </button>
        </div>
      </div>
    </div>
  );
}

function SubscriptionCard({ sub, onCancel, onUndo, actionLoading }: {
  sub: Subscription; onCancel: () => void; onUndo: () => void; actionLoading: string | null;
}) {
  const group = sub.group;
  const tutorName = group?.tutor?.full_name ?? 'Tutor';
  const initial = (group?.name?.[0] ?? '?').toUpperCase();

  const isActive    = sub.status === 'ACTIVE' && !sub.cancel_at_period_end;
  const isGrace     = sub.status === 'GRACE';
  const isSuspended = sub.status === 'SUSPENDED';
  const isPending   = sub.status === 'PENDING_PAYMENT';
  const isCancelling= sub.cancel_at_period_end;
  const isActivating= sub.status === 'ACTIVATION_FAILED';
  const isCancelled = sub.status === 'CANCELLED';

  // Billing cycle starts from last paid date
  const progress  = cycleProgress(sub.last_paid_at, sub.current_period_end);
  const remaining = daysLeft(sub.current_period_end);

  return (
    <div className="rounded-2xl border border-border bg-background overflow-hidden">
      {/* Alert banners */}
      {isGrace && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          Payment overdue — grace period ends {fmtDate(sub.grace_period_ends_at)}.
        </div>
      )}
      {isSuspended && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-3 text-sm text-red-800 flex items-center gap-2">
          <Ban className="size-4 shrink-0" />
          Access suspended due to non-payment.
        </div>
      )}
      {isActivating && (
        <div className="bg-blue-50 border-b border-blue-200 px-5 py-3 text-sm text-blue-800 flex items-center gap-2">
          <Loader2 className="size-4 shrink-0 animate-spin" />
          Payment received — activation pending. Do not pay again.
        </div>
      )}
      {isCancelling && (
        <div className="bg-zinc-50 border-b border-zinc-200 px-5 py-3 text-sm text-zinc-700 flex items-center gap-2">
          <X className="size-4 shrink-0" />
          Cancels on {fmtDate(sub.current_period_end)} — access remains until then.
        </div>
      )}

      <div className="p-6 space-y-5">
        {/* Header row */}
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <div className="size-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 grid place-items-center text-white font-bold text-2xl">
              {initial}
            </div>
            {(isActive || isGrace) && (
              <div className="absolute -bottom-1 -right-1 size-6 rounded-full bg-green-500 border-2 border-background grid place-items-center">
                <CheckCircle className="size-3.5 text-white" strokeWidth={3} />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-ink text-lg leading-tight">{group?.name ?? 'Unknown Group'}</span>
              {sub.status === 'ACTIVE' && !isCancelling && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border border-green-300 text-green-700 bg-green-50">
                  <span className="size-1.5 rounded-full bg-green-500 inline-block" /> Active
                </span>
              )}
              {isGrace      && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-amber-700">Grace period</span>}
              {isSuspended  && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-red-100 text-red-700">Suspended</span>}
              {isCancelling && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-zinc-100 text-zinc-600">Cancelling</span>}
              {isPending    && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-100 text-blue-700">Pending</span>}
              {isCancelled  && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-zinc-100 text-zinc-600">Cancelled</span>}
              {isActivating && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-100 text-blue-700">Activating</span>}
              {sub.next_cycle_paid && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                  <CalendarCheck2 className="size-3.5" /> Next month paid
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              with <span className="font-medium text-ink">{tutorName}</span>
            </div>
          </div>

          {sub.plan_price_ttd && (
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold text-ink">{fmtTTD(sub.plan_price_ttd)}</div>
              <div className="text-xs text-muted-foreground">per month</div>
            </div>
          )}
        </div>

        {/* Billing cycle progress — starts from last_paid_at */}
        {sub.last_paid_at && sub.current_period_end && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Billing cycle</span>
              <span className={cn('text-sm font-semibold', remaining <= 5 ? 'text-amber-600' : 'text-ink')}>
                {remaining} day{remaining !== 1 ? 's' : ''} left
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  isGrace ? 'bg-amber-400' : isSuspended ? 'bg-red-400' : 'bg-gradient-to-r from-violet-500 to-purple-400'
                )}
                style={{ width: `${Math.max(2, progress)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{fmtShort(sub.last_paid_at)}</span>
              <span>{fmtShort(sub.current_period_end)}</span>
            </div>
          </div>
        )}

        {/* Date grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4 pt-2 border-t border-border">
          {sub.current_period_start && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Period start</div>
              <div className="text-sm font-semibold text-ink">{fmtShortYear(sub.current_period_start)}</div>
            </div>
          )}
          {sub.current_period_end && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Period end</div>
              <div className="text-sm font-semibold text-ink">{fmtShortYear(sub.current_period_end)}</div>
            </div>
          )}
          {sub.next_payment_due_at && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Next payment</div>
              <div className="text-sm font-semibold text-ink">{fmtShortYear(sub.next_payment_due_at)}</div>
            </div>
          )}
          {sub.last_paid_at && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Last paid</div>
              <div className="text-sm font-semibold text-ink">{fmtShortYear(sub.last_paid_at)}</div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link href={`/student/groups/${sub.group_id}?open=1`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-ink text-white text-sm font-semibold hover:bg-ink/90 transition">
            <Play className="size-3.5 fill-white" /> Open Class
          </Link>

          {isActive && !sub.next_cycle_paid && (
            <a href={`/student/subscriptions/${sub.id}/pay`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-semibold text-ink hover:bg-muted/50 transition">
              <CreditCard className="size-3.5" /> Pay next month
            </a>
          )}

          {(isGrace || isSuspended) && (
            <a href={`/student/subscriptions/${sub.id}/pay`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition">
              <RefreshCw className="size-3.5" /> {isSuspended ? 'Reactivate' : 'Renew now'}
            </a>
          )}

          {isPending && sub.pending_payment_expires_at && new Date(sub.pending_payment_expires_at) > new Date() && (
            <a href={`/student/subscriptions/${sub.id}/pay`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition">
              <CreditCard className="size-3.5" /> Complete payment
            </a>
          )}

          {isCancelling && sub.current_period_end && new Date(sub.current_period_end) > new Date() && (
            <button onClick={onUndo} disabled={actionLoading === sub.id + '-undo'}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-semibold text-ink hover:bg-muted/50 transition disabled:opacity-60">
              {actionLoading === sub.id + '-undo' ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle className="size-3.5" />}
              Undo cancellation
            </button>
          )}

          <div className="flex-1" />

          {isActive && (
            <button onClick={onCancel}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-red-600 hover:bg-red-50 transition">
              <X className="size-3.5" /> Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StudentSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading]             = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget]   = useState<Subscription | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch('/api/subscriptions/my');
      const data = await res.json();
      setSubscriptions(data.subscriptions ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function cancelSubscription(sub: Subscription) {
    setActionLoading(sub.id + '-cancel');
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}/cancel`, { method: 'POST' });
      if (res.ok) { setCancelTarget(null); await load(); }
      else { const d = await res.json(); alert(d.error || 'Failed to cancel'); }
    } finally { setActionLoading(null); }
  }

  async function undoCancel(id: string) {
    setActionLoading(id + '-undo');
    try {
      const res = await fetch(`/api/subscriptions/${id}/undo-cancellation`, { method: 'POST' });
      if (res.ok) await load();
      else { const d = await res.json(); alert(d.error || 'Failed to undo cancellation'); }
    } finally { setActionLoading(null); }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  const active   = subscriptions.filter((s) => ['ACTIVE','GRACE','SUSPENDED','PENDING_PAYMENT','ACTIVATION_FAILED'].includes(s.status));
  const inactive = subscriptions.filter((s) => s.status === 'CANCELLED');

  const monthlyBill = active.reduce((sum, s) => sum + (s.plan_price_ttd ?? 0), 0);
  const nextCharge  = active
    .filter((s) => s.next_payment_due_at)
    .sort((a, b) => new Date(a.next_payment_due_at!).getTime() - new Date(b.next_payment_due_at!).getTime())[0]
    ?.next_payment_due_at ?? null;

  return (
    <>
      {cancelTarget && (
        <CancelModal
          sub={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={() => cancelSubscription(cancelTarget)}
          loading={actionLoading === cancelTarget.id + '-cancel'}
        />
      )}

      <div className="max-w-4xl mx-auto space-y-6 py-6 px-4">

        {/* Hero banner */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-500 px-8 py-8 text-white">
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: 'radial-gradient(circle at 75% 50%, white 0%, transparent 55%)' }} />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex-1">
              {active.length > 0 && (
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-white/20 backdrop-blur mb-3">
                  <Star className="size-3 fill-white" />
                  {active.length} active plan{active.length !== 1 ? 's' : ''}
                </div>
              )}
              <h1 className="text-4xl font-bold leading-tight">My Subscriptions</h1>
              <p className="text-white/70 text-sm mt-2 max-w-sm">
                Keep your group classes rolling. Manage billing, pause, or upgrade — all in one place.
              </p>
            </div>

            {active.length > 0 && (
              <div className="flex gap-3 shrink-0">
                <div className="rounded-2xl bg-white/15 backdrop-blur px-5 py-4 text-center min-w-[120px]">
                  <div className="text-xs text-white/70 font-medium mb-1 flex items-center gap-1 justify-center">
                    <TrendingUp className="size-3" /> Monthly bill
                  </div>
                  <div className="text-2xl font-bold">{fmtTTD(monthlyBill)}</div>
                </div>
                {nextCharge && (
                  <div className="rounded-2xl bg-white/15 backdrop-blur px-5 py-4 text-center min-w-[120px]">
                    <div className="text-xs text-white/70 font-medium mb-1 flex items-center gap-1 justify-center">
                      <Clock className="size-3" /> Next charge
                    </div>
                    <div className="text-2xl font-bold">{fmtShort(nextCharge)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Empty state */}
        {subscriptions.length === 0 && (
          <div className="text-center py-24 text-muted-foreground">
            <CreditCard className="size-14 mx-auto mb-4 opacity-30" />
            <p className="font-semibold text-ink text-lg">No subscriptions yet</p>
            <p className="text-sm mt-1">Browse group classes and subscribe to get started.</p>
            <Link href="/student/find-tutors"
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition">
              Browse classes
            </Link>
          </div>
        )}

        {/* Active subscriptions */}
        {active.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Active subscriptions</h2>
              <span className="text-sm text-muted-foreground">{active.length} subscription{active.length !== 1 ? 's' : ''}</span>
            </div>
            {active.map((sub) => (
              <SubscriptionCard key={sub.id} sub={sub}
                onCancel={() => setCancelTarget(sub)}
                onUndo={() => undoCancel(sub.id)}
                actionLoading={actionLoading}
              />
            ))}
          </div>
        )}

        {/* Past / cancelled */}
        {inactive.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Past subscriptions</h2>
            {inactive.map((sub) => (
              <SubscriptionCard key={sub.id} sub={sub}
                onCancel={() => setCancelTarget(sub)}
                onUndo={() => undoCancel(sub.id)}
                actionLoading={actionLoading}
              />
            ))}
          </div>
        )}

        {/* Bottom cards */}
        {subscriptions.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            <Link href="/student/find-tutors"
              className="rounded-2xl border border-border bg-background p-6 flex items-center gap-4 hover:shadow-sm hover:-translate-y-0.5 transition-all">
              <div className="size-12 rounded-2xl bg-purple-100 grid place-items-center shrink-0">
                <Sparkles className="size-6 text-purple-600" />
              </div>
              <div>
                <div className="font-semibold text-ink">Discover more group classes</div>
                <div className="text-sm text-muted-foreground mt-0.5">Find subjects taught by top-rated tutors.</div>
              </div>
            </Link>

            <Link href="/support"
              className="rounded-2xl border border-border bg-background p-6 flex items-center gap-4 hover:shadow-sm hover:-translate-y-0.5 transition-all">
              <div className="size-12 rounded-2xl bg-sky-100 grid place-items-center shrink-0">
                <LifeBuoy className="size-6 text-sky-600" />
              </div>
              <div>
                <div className="font-semibold text-ink">Contact support</div>
                <div className="text-sm text-muted-foreground mt-0.5">Need help with billing or your subscription?</div>
              </div>
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
