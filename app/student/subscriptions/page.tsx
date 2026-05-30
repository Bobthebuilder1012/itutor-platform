'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, Clock, CheckCircle, AlertCircle, Ban, X, Loader2, ArrowLeft, RefreshCw } from 'lucide-react';
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
  group: {
    id: string;
    name: string;
    cover_image: string | null;
    subject: string | null;
    tutor: { full_name: string | null; avatar_url: string | null } | null;
  } | null;
};

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    ACTIVE:   { label: 'Active', className: 'bg-green-100 text-green-800' },
    GRACE:    { label: 'Grace period', className: 'bg-amber-100 text-amber-800' },
    SUSPENDED:{ label: 'Suspended', className: 'bg-red-100 text-red-800' },
    CANCELLED:{ label: 'Cancelled', className: 'bg-zinc-100 text-zinc-600' },
    PENDING_PAYMENT: { label: 'Pending', className: 'bg-blue-100 text-blue-800' },
    ACTIVATION_FAILED: { label: 'Activating', className: 'bg-blue-100 text-blue-800' },
    WAITLISTED: { label: 'Waitlisted', className: 'bg-purple-100 text-purple-800' },
  };
  const c = cfg[status] ?? { label: status, className: 'bg-zinc-100 text-zinc-600' };
  return (
    <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', c.className)}>{c.label}</span>
  );
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function StudentSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

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

  async function cancelSubscription(id: string) {
    if (!confirm('Cancel your subscription at the end of the current period?')) return;
    setActionLoading(id + '-cancel');
    try {
      const res = await fetch(`/api/subscriptions/${id}/cancel`, { method: 'POST' });
      if (res.ok) await load();
      else {
        const d = await res.json();
        alert(d.error || 'Failed to cancel');
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function undoCancel(id: string) {
    setActionLoading(id + '-undo');
    try {
      const res = await fetch(`/api/subscriptions/${id}/undo-cancellation`, { method: 'POST' });
      if (res.ok) await load();
      else {
        const d = await res.json();
        alert(d.error || 'Failed to undo cancellation');
      }
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">
      <div className="flex items-center gap-3">
        <Link href="/student/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink transition">
          <ArrowLeft className="size-4" /> Dashboard
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-ink">My Subscriptions</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your group class subscriptions</p>
      </div>

      {subscriptions.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <CreditCard className="size-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium">No subscriptions yet</p>
          <Link href="/student/find-tutors" className="mt-4 inline-block text-brand-deep font-semibold text-sm">Browse classes →</Link>
        </div>
      )}

      <div className="space-y-4">
        {subscriptions.map((sub) => {
          const group = sub.group;
          const tutorName = group?.tutor?.full_name ?? 'Tutor';
          const isActive = sub.status === 'ACTIVE' && !sub.cancel_at_period_end;
          const isGrace = sub.status === 'GRACE';
          const isSuspended = sub.status === 'SUSPENDED';
          const isPending = sub.status === 'PENDING_PAYMENT';
          const isCancelling = sub.cancel_at_period_end;
          const isActivating = sub.status === 'ACTIVATION_FAILED';

          return (
            <div key={sub.id} className="rounded-2xl border border-border bg-card p-5 space-y-4">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="size-12 rounded-xl bg-gradient-to-br from-brand to-emerald-400 grid place-items-center text-white font-bold text-lg shrink-0">
                  {group?.name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink truncate">{group?.name ?? 'Unknown Group'}</span>
                    <StatusPill status={sub.status} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">with {tutorName} · {group?.subject ?? 'General'}</div>
                </div>
                {sub.plan_price_ttd && (
                  <div className="text-right shrink-0">
                    <div className="font-bold text-ink">{fmtTTD(sub.plan_price_ttd)}</div>
                    <div className="text-[11px] text-muted-foreground">/month</div>
                  </div>
                )}
              </div>

              {/* State-specific info */}
              {isGrace && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 flex items-center gap-2">
                  <AlertCircle className="size-3.5 shrink-0" />
                  Payment overdue. Grace period ends {fmtDate(sub.grace_period_ends_at)}.
                </div>
              )}
              {isSuspended && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-800 flex items-center gap-2">
                  <Ban className="size-3.5 shrink-0" />
                  Suspended due to non-payment.
                </div>
              )}
              {isActivating && (
                <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2.5 text-xs text-blue-800 flex items-center gap-2">
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  Payment received — activation pending. Do not pay again.
                </div>
              )}
              {isCancelling && (
                <div className="rounded-xl bg-zinc-50 border border-zinc-200 px-3 py-2.5 text-xs text-zinc-700 flex items-center gap-2">
                  <X className="size-3.5 shrink-0" />
                  Cancels on {fmtDate(sub.current_period_end)}.
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {sub.current_period_start && (
                  <div>
                    <div className="text-muted-foreground">Period start</div>
                    <div className="font-medium text-ink">{fmtDate(sub.current_period_start)}</div>
                  </div>
                )}
                {sub.current_period_end && (
                  <div>
                    <div className="text-muted-foreground">Period end</div>
                    <div className="font-medium text-ink">{fmtDate(sub.current_period_end)}</div>
                  </div>
                )}
                {sub.next_payment_due_at && (
                  <div>
                    <div className="text-muted-foreground">Next payment</div>
                    <div className="font-medium text-ink">{fmtDate(sub.next_payment_due_at)}</div>
                  </div>
                )}
                {sub.last_paid_at && (
                  <div>
                    <div className="text-muted-foreground">Last paid</div>
                    <div className="font-medium text-ink">{fmtDate(sub.last_paid_at)}</div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={`/student/groups/${sub.group_id}`}
                  className="px-3 py-1.5 rounded-xl border border-border text-xs font-medium hover:bg-muted/40 transition">
                  View class
                </Link>

                {(isGrace || isSuspended) && (
                  <a href={`/student/subscriptions/${sub.id}/pay`}
                    className="px-3 py-1.5 rounded-xl bg-brand text-white text-xs font-medium hover:bg-brand-deep transition inline-flex items-center gap-1">
                    <RefreshCw className="size-3" /> {isSuspended ? 'Reactivate' : 'Renew now'}
                  </a>
                )}

                {isPending && sub.pending_payment_expires_at && new Date(sub.pending_payment_expires_at) > new Date() && (
                  <a href={`/student/subscriptions/${sub.id}/pay`}
                    className="px-3 py-1.5 rounded-xl bg-brand text-white text-xs font-medium hover:bg-brand-deep transition inline-flex items-center gap-1">
                    <CreditCard className="size-3" /> Complete payment
                  </a>
                )}

                {isCancelling && sub.current_period_end && new Date(sub.current_period_end) > new Date() && (
                  <button onClick={() => undoCancel(sub.id)} disabled={actionLoading === sub.id + '-undo'}
                    className="px-3 py-1.5 rounded-xl bg-zinc-700 text-white text-xs font-medium hover:bg-zinc-800 transition inline-flex items-center gap-1 disabled:opacity-60">
                    {actionLoading === sub.id + '-undo' ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle className="size-3" />}
                    Undo cancellation
                  </button>
                )}

                {isActive && (
                  <button onClick={() => cancelSubscription(sub.id)} disabled={actionLoading === sub.id + '-cancel'}
                    className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition inline-flex items-center gap-1 disabled:opacity-60">
                    {actionLoading === sub.id + '-cancel' ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                    Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
