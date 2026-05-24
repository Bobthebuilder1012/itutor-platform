'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import ParentShell from '@/components/parent/ParentShell';
import { PAYMENT_HISTORY, CHILDREN, type PaymentEntry } from '@/lib/mock';
import { cn } from '@/lib/utils';

type KindFilter = 'all' | 'consent' | 'renewal' | 'refund' | 'one-off';

const KIND_LABELS: Record<PaymentEntry['kind'], string> = {
  consent: 'Consent',
  renewal: 'Renewal',
  refund: 'Refund',
  'one-off': 'One-off',
};

const KIND_BADGE: Record<PaymentEntry['kind'], string> = {
  consent: 'bg-sky text-ink',
  renewal: 'bg-brand-soft text-brand-deep',
  refund: 'bg-coral-soft text-coral',
  'one-off': 'bg-lavender text-ink',
};

const STATUS_CHIP: Record<PaymentEntry['status'], string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  'pending-consent': 'bg-amber-100 text-amber-700',
  overdue: 'bg-rose-100 text-rose-700',
  refunded: 'bg-muted text-muted-foreground',
};

const STATUS_LABELS: Record<PaymentEntry['status'], string> = {
  paid: 'Paid',
  'pending-consent': 'Pending consent',
  overdue: 'Overdue',
  refunded: 'Refunded',
};

const childNames = ['All', ...Array.from(new Set(CHILDREN.map((c) => c.name)))];
const kindOptions: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'consent', label: 'Consent' },
  { value: 'renewal', label: 'Renewal' },
  { value: 'refund', label: 'Refund' },
  { value: 'one-off', label: 'One-off' },
];

const paidTotal = PAYMENT_HISTORY.filter((e) => e.status === 'paid').reduce((s, e) => s + e.amount, 0);
const refundedTotal = PAYMENT_HISTORY.filter((e) => e.status === 'refunded').reduce((s, e) => s + e.amount, 0);
const activeSubscriptions = CHILDREN.reduce(
  (count, child) => count + child.enrollments.filter((e) => e.status === 'active').length,
  0,
);

export default function BillingPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [childFilter, setChildFilter] = useState('All');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'parent')) {
      router.push('/login');
    }
  }, [profile, loading, router]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  const filtered = PAYMENT_HISTORY.filter((e) => {
    if (childFilter !== 'All' && e.childName !== childFilter) return false;
    if (kindFilter !== 'all' && e.kind !== kindFilter) return false;
    return true;
  });

  return (
    <ParentShell>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">Consent &amp; payment history</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A complete log of every class you&apos;ve consented to, every renewal charged, and any refunds.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl bg-card border border-border p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Paid this period</p>
            <p className="mt-2 text-2xl font-bold text-ink">TT${paidTotal.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Refunded</p>
            <p className="mt-2 text-2xl font-bold text-ink">TT${refundedTotal.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active subscriptions</p>
            <p className="mt-2 text-2xl font-bold text-ink">{activeSubscriptions}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={childFilter}
            onChange={(e) => setChildFilter(e.target.value)}
            className="rounded-xl border border-border bg-card text-ink text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {childNames.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>

          <div className="flex flex-wrap gap-2">
            {kindOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setKindFilter(opt.value)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors border',
                  kindFilter === opt.value
                    ? 'bg-brand text-white border-brand'
                    : 'bg-card text-ink border-border hover:border-brand',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl bg-card border border-border p-10 text-center">
              <p className="text-muted-foreground text-sm">No transactions match your filters.</p>
            </div>
          ) : (
            filtered.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl bg-card border border-border p-4 flex items-center gap-4"
              >
                <div className="shrink-0 text-right min-w-[90px]">
                  <p className="text-xs text-muted-foreground">{entry.date}</p>
                  <span
                    className={cn(
                      'mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                      KIND_BADGE[entry.kind],
                    )}
                  >
                    {KIND_LABELS[entry.kind]}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink truncate">{entry.classTitle}</p>
                  <p className="text-sm text-muted-foreground">{entry.childName}</p>
                  {entry.note && <p className="text-xs text-muted-foreground mt-1">{entry.note}</p>}
                </div>

                <div className="shrink-0 text-right">
                  <p className="font-bold text-ink">
                    {entry.amount > 0 ? `TT$${entry.amount}` : '—'}
                  </p>
                  <span
                    className={cn(
                      'mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium',
                      STATUS_CHIP[entry.status],
                    )}
                  >
                    {STATUS_LABELS[entry.status]}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ParentShell>
  );
}
