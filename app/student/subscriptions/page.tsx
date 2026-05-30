'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, Clock, CheckCircle, AlertCircle, Ban, X, Loader2, ArrowLeft, RefreshCw, CalendarCheck2 } from 'lucide-react';
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

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    ACTIVE:             { label: 'Active',          className: 'bg-green-100 text-green-800' },
    GRACE:              { label: 'Grace period',    className: 'bg-amber-100 text-amber-800' },
    SUSPENDED:          { label: 'Suspended',       className: 'bg-red-100 text-red-800' },
    CANCELLED:          { label: 'Cancelled',       className: 'bg-zinc-100 text-zinc-600' },
    PENDING_PAYMENT:    { label: 'Pending',         className: 'bg-blue-100 text-blue-800' },
    ACTIVATION_FAILED:  { label: 'Activating',      className: 'bg-blue-100 text-blue-800' },
    WAITLISTED:         { label: 'Waitlisted',      className: 'bg-purple-100 text-purple-800' },
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
      <div
        className="w-full max-w-md bg-background rounded-2xl shadow-2xl border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
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
                <span>No future charges will be made. You will <strong className="text-ink">not be billed</strong> for the next cycle.</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertCircle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                <span>Cancellations are <strong className="text-ink">not refunded</strong> for the current billing period already paid.</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertCircle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                <span>If you change your mind, you can <strong className="text-ink">undo this</strong> before {accessUntil}.</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col sm:flex-row gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-ink hover:bg-muted transition"
          >
            Keep subscription
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            Confirm cancellation
          </button>
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

  async function cancelSubscription(sub: Subscription) {
    setActionLoading(sub.id + '-cancel');
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}/cancel`, { method: 'POST' });
      if (res.ok) {
        setCancelTarget(null);
        await load();
      } else {
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
                      {sub.next_cycle_paid && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          <CalendarCheck2 className="size-3" /> Next month paid
                        </span>
                      )}
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
                  <Link
                    href={`/student/groups/${sub.group_id}`}
                    className="px-3 py-1.5 rounded-xl border border-border text-xs font-medium hover:bg-muted/40 transition"
                  >
                    Open Class
                  </Link>

                  {(isGrace || isSuspended) && (
                    <a href={`/student/subscriptions/${sub.id}/pay`}
                      className="px-3 py-1.5 rounded-xl bg-brand text-white text-xs font-medium hover:bg-brand-deep transition inline-flex items-center gap-1">
                      <RefreshCw className="size-3" /> {isSuspended ? 'Reactivate' : 'Renew now'}
                    </a>
                  )}

                  {isActive && !sub.next_cycle_paid && (
                    <a href={`/student/subscriptions/${sub.id}/pay`}
                      className="px-3 py-1.5 rounded-xl border border-brand text-brand text-xs font-medium hover:bg-brand-soft transition inline-flex items-center gap-1">
                      <CreditCard className="size-3" /> Pay next month
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
                    <button
                      onClick={() => setCancelTarget(sub)}
                      className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition inline-flex items-center gap-1"
                    >
                      <X className="size-3" />
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
