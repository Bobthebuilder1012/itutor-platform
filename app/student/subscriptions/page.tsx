'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CreditCard, CheckCircle, AlertCircle, Ban, X, Loader2,
  RefreshCw, CalendarCheck2, Play, Sparkles, TrendingUp, Clock, Star,
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

function fmtDate(d: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-TT', opts ?? { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtShort(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-TT', { day: 'numeric', month: 'short' });
}

function daysLeft(d: string | null): number {
  if (!d) return 0;
  const diff = new Date(d).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function cycleProgress(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const now = Date.now();
  if (now <= s) return 0;
  if (now >= e) return 100;
  return Math.round(((now - s) / (e - s)) * 100);
}

function CancelModal({ sub, onClose, onConfirm, loading }: {
  sub: Subscription;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
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
                <span>You keep <strong className="text-ink">full access</strong> until <strong className="text-ink">{accessUntil}</strong> — the end of your current billing month.</span>
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
  sub: Subscription;
  onCancel: () => void;
  onUndo: () => void;
  actionLoading: string | null;
}) {
  const group = sub.group;
  const tutorName = group?.tutor?.full_name ?? 'Tutor';
  const initial = (group?.name?.[0] ?? '?').toUpperCase();

  const isActive = sub.status === 'ACTIVE' && !sub.cancel_at_period_end;
  const isGrace = sub.status === 'GRACE';
  const isSuspended = sub.status === 'SUSPENDED';
  const isPending = sub.status === 'PENDING_PAYMENT';
  const isCancelling = sub.cancel_at_period_end;
  const isActivating = sub.status === 'ACTIVATION_FAILED';
  const isCancelled = sub.status === 'CANCELLED';

  const progress = cycleProgress(sub.current_period_start, sub.current_period_end);
  const remaining = daysLeft(sub.current_period_end);

  return (
    <div className="rounded-2xl border border-border bg-background overflow-hidden">
      {/* Alert banners */}
      {isGrace && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="size-3.5 shrink-0" />
          Payment overdue — grace period ends {fmtDate(sub.grace_period_ends_at)}.
        </div>
      )}
      {isSuspended && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-xs text-red-800 flex items-center gap-2">
          <Ban className="size-3.5 shrink-0" />
          Access suspended due to non-payment.
        </div>
      )}
      {isActivating && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 text-xs text-blue-800 flex items-center gap-2">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          Payment received — activation pending. Do not pay again.
        </div>
      )}
      {isCancelling && (
        <div className="bg-zinc-50 border-b border-zinc-200 px-4 py-2.5 text-xs text-zinc-700 flex items-center gap-2">
          <X className="size-3.5 shrink-0" />
          Cancels on {fmtDate(sub.current_period_end)} — access remains until then.
        </div>
      )}

      <div className="p-5 space-y-5">
        {/* Header row */}
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="size-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 grid place-items-center text-white font-bold text-xl">
              {initial}
            </div>
            {(isActive || isGrace) && (
              <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-green-500 border-2 border-background grid place-items-center">
                <CheckCircle className="size-3 text-white" strokeWidth={3} />
              </div>
            )}
          </div>

          {/* Title block */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-ink text-base leading-tight">{group?.name ?? 'Unknown Group'}</span>
              {/* Status pill */}
              {sub.status === 'ACTIVE' && !isCancelling && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-green-300 text-green-700 bg-green-50">
                  <span className="size-1.5 rounded-full bg-green-500 inline-block" />
                  Active
                </span>
              )}
              {isGrace && <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Grace period</span>}
              {isSuspended && <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">Suspended</span>}
              {isCancelling && <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600">Cancelling</span>}
              {isPending && <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Pending</span>}
              {isCancelled && <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600">Cancelled</span>}
              {isActivating && <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Activating</span>}
              {sub.next_cycle_paid && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  <CalendarCheck2 className="size-3" /> Next month paid
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              with <span className="font-medium text-ink">{tutorName}</span> · {group?.subject ?? 'General'}
            </div>
          </div>

          {/* Price */}
          {sub.plan_price_ttd && (
            <div className="text-right shrink-0">
              <div className="text-xl font-bold text-ink">{fmtTTD(sub.plan_price_ttd)}</div>
              <div className="text-xs text-muted-foreground">per month</div>
            </div>
          )}
        </div>

        {/* Billing cycle progress */}
        {sub.current_period_start && sub.current_period_end && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">Billing cycle</span>
              <span className={cn(
                'font-semibold',
                remaining <= 5 ? 'text-amber-600' : 'text-ink'
              )}>
                {remaining} day{remaining !== 1 ? 's' : ''} left
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  isGrace ? 'bg-amber-400' : isSuspended ? 'bg-red-400' : 'bg-gradient-to-r from-purple-500 to-violet-400'
                )}
                style={{ width: `${Math.max(2, progress)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{fmtShort(sub.current_period_start)}</span>
              <span>{fmtShort(sub.current_period_end)}</span>
            </div>
          </div>
        )}

        {/* Date grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1 border-t border-border">
          {sub.current_period_start && (
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Period start</div>
              <div className="text-sm font-semibold text-ink">{fmtShort(sub.current_period_start)} {new Date(sub.current_period_start).getFullYear()}</div>
            </div>
          )}
          {sub.current_period_end && (
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Period end</div>
              <div className="text-sm font-semibold text-ink">{fmtShort(sub.current_period_end)} {new Date(sub.current_period_end).getFullYear()}</div>
            </div>
          )}
          {sub.next_payment_due_at && (
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Next payment</div>
              <div className="text-sm font-semibold text-ink">{fmtShort(sub.next_payment_due_at)} {new Date(sub.next_payment_due_at).getFullYear()}</div>
            </div>
          )}
          {sub.last_paid_at && (
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Last paid</div>
              <div className="text-sm font-semibold text-ink">{fmtShort(sub.last_paid_at)} {new Date(sub.last_paid_at).getFullYear()}</div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/student/groups/${sub.group_id}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-ink text-white text-sm font-semibold hover:bg-ink/90 transition"
          >
            <Play className="size-3.5 fill-white" /> Open Class
          </Link>

          {isActive && !sub.next_cycle_paid && (
            <a href={`/student/subscriptions/${sub.id}/pay`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-ink hover:bg-muted/50 transition">
              <CreditCard className="size-3.5" /> Pay next month
            </a>
          )}

          {(isGrace || isSuspended) && (
            <a href={`/student/subscriptions/${sub.id}/pay`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition">
              <RefreshCw className="size-3.5" /> {isSuspended ? 'Reactivate' : 'Renew now'}
            </a>
          )}

          {isPending && sub.pending_payment_expires_at && new Date(sub.pending_payment_expires_at) > new Date() && (
            <a href={`/student/subscriptions/${sub.id}/pay`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition">
              <CreditCard className="size-3.5" /> Complete payment
            </a>
          )}

          {isCancelling && sub.current_period_end && new Date(sub.current_period_end) > new Date() && (
            <button onClick={onUndo} disabled={actionLoading === sub.id + '-undo'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-ink hover:bg-muted/50 transition disabled:opacity-60">
              {actionLoading === sub.id + '-undo' ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle className="size-3.5" />}
              Undo cancellation
            </button>
          )}

          <div className="flex-1" />

          {isActive && (
            <button onClick={onCancel}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-red-600 hover:bg-red-50 transition">
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
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/subscriptions/my');
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

  const active = subscriptions.filter((s) => ['ACTIVE', 'GRACE', 'SUSPENDED', 'PENDING_PAYMENT', 'ACTIVATION_FAILED'].includes(s.status));
  const inactive = subscriptions.filter((s) => ['CANCELLED'].includes(s.status));

  // Hero stats
  const monthlySpend = active.reduce((sum, s) => sum + (s.plan_price_ttd ?? 0), 0);
  const nextCharge = active
    .filter((s) => s.next_payment_due_at)
    .sort((a, b) => new Date(a.next_payment_due_at!).getTime() - new Date(b.next_payment_due_at!).getTime())[0]?.next_payment_due_at ?? null;

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

      <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">

        {/* Hero banner */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-500 p-6 text-white">
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: 'radial-gradient(circle at 70% 50%, white 0%, transparent 60%)' }} />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex-1">
              {subscriptions.length > 0 && (
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-white/20 backdrop-blur mb-3">
                  <Star className="size-3 fill-white" />
                  {active.length} active plan{active.length !== 1 ? 's' : ''}
                </div>
              )}
              <h1 className="text-3xl font-bold leading-tight">My Subscriptions</h1>
              <p className="text-white/70 text-sm mt-1">
                Keep your group classes rolling. Manage billing, pause, or upgrade — all in one place.
              </p>
            </div>

            {active.length > 0 && (
              <div className="flex gap-3 shrink-0">
                <div className="rounded-2xl bg-white/15 backdrop-blur px-4 py-3 text-center min-w-[100px]">
                  <div className="text-[11px] text-white/70 font-medium mb-0.5 flex items-center gap-1 justify-center">
                    <TrendingUp className="size-3" /> Monthly spend
                  </div>
                  <div className="text-xl font-bold">{fmtTTD(monthlySpend)}</div>
                </div>
                {nextCharge && (
                  <div className="rounded-2xl bg-white/15 backdrop-blur px-4 py-3 text-center min-w-[100px]">
                    <div className="text-[11px] text-white/70 font-medium mb-0.5 flex items-center gap-1 justify-center">
                      <Clock className="size-3" /> Next charge
                    </div>
                    <div className="text-xl font-bold">{fmtShort(nextCharge)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Empty state */}
        {subscriptions.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <CreditCard className="size-12 mx-auto mb-4 opacity-30" />
            <p className="font-semibold text-ink">No subscriptions yet</p>
            <p className="text-sm mt-1">Browse group classes and subscribe to get started.</p>
            <Link href="/student/find-tutors"
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition">
              Browse classes
            </Link>
          </div>
        )}

        {/* Active subscriptions */}
        {active.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Active subscriptions</h2>
              <span className="text-sm text-muted-foreground">{active.length} subscription{active.length !== 1 ? 's' : ''}</span>
            </div>
            {active.map((sub) => (
              <SubscriptionCard
                key={sub.id}
                sub={sub}
                onCancel={() => setCancelTarget(sub)}
                onUndo={() => undoCancel(sub.id)}
                actionLoading={actionLoading}
              />
            ))}
          </div>
        )}

        {/* Past / cancelled */}
        {inactive.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">Past subscriptions</h2>
            {inactive.map((sub) => (
              <SubscriptionCard
                key={sub.id}
                sub={sub}
                onCancel={() => setCancelTarget(sub)}
                onUndo={() => undoCancel(sub.id)}
                actionLoading={actionLoading}
              />
            ))}
          </div>
        )}

        {/* Bottom discovery cards */}
        {subscriptions.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            <Link href="/student/find-tutors"
              className="rounded-2xl border border-border bg-background p-5 flex items-center gap-4 hover:shadow-sm hover:-translate-y-0.5 transition-all group">
              <div className="size-11 rounded-2xl bg-purple-100 grid place-items-center shrink-0">
                <Sparkles className="size-5 text-purple-600" />
              </div>
              <div>
                <div className="font-semibold text-ink text-sm">Discover more group classes</div>
                <div className="text-xs text-muted-foreground mt-0.5">Find subjects taught by top-rated tutors.</div>
              </div>
            </Link>

            <div className="rounded-2xl bg-ink text-white p-5 flex items-center gap-4">
              <div className="size-11 rounded-2xl bg-white/10 grid place-items-center shrink-0">
                <TrendingUp className="size-5 text-white" />
              </div>
              <div>
                <div className="font-semibold text-sm">Stay consistent</div>
                <div className="text-xs text-white/60 mt-0.5">Keep the streak going — open your class today.</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
