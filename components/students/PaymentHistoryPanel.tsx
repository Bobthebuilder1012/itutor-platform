'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { X, Check, Clock, AlertTriangle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  generateHistoryForMember,
  getPaymentStatus,
  getLatestCycle,
  getMembershipStatus,
  STATUS_META,
  MEMBERSHIP_META,
  GRACE_PERIOD_DAYS,
  type MemberBilling,
  type PaymentStatus,
} from '@/lib/utils/paymentCycles';

const ICONS: Record<PaymentStatus, typeof Check> = {
  ON_TIME: Check,
  DUE: Clock,
  OVERDUE: AlertTriangle,
  LATE: AlertCircle,
};

const fmt = (d: Date | null) => (d ? format(d, 'd MMM') : '—');
const fmtLong = (d: Date | null) => (d ? format(d, 'd MMM yyyy') : '—');

export interface PaymentHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  name: string;
  email?: string | null;
  billing: MemberBilling;
}

export default function PaymentHistoryPanel({ open, onClose, name, email, billing }: PaymentHistoryPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const cycles = useMemo(() => generateHistoryForMember(billing), [billing]);
  const latest = getLatestCycle(cycles);
  const currentStatus = latest ? getPaymentStatus(latest) : null;
  const membership = currentStatus ? getMembershipStatus(currentStatus) : 'ACTIVE';
  const joined = billing.joinedAt ? new Date(billing.joinedAt) : null;
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  // Close on Escape; focus the close button when opened.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={cn('fixed inset-0 z-[60] bg-black/40 transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none')}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Payment history for ${name}`}
        className={cn(
          'fixed top-0 right-0 z-[61] h-full w-full max-w-md bg-white text-ink shadow-2xl flex flex-col transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="border-b border-gray-100 p-5">
          <div className="flex items-start gap-3">
            <div className="size-11 rounded-full bg-gradient-to-br from-brand to-emerald-400 grid place-items-center text-sm font-bold text-white shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900 text-lg leading-tight">{name}</div>
              {email && <div className="text-sm text-gray-500 truncate">{email}</div>}
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close payment history"
              className="size-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat label="Joined" value={joined ? fmtLong(joined) : '—'} />
            <Stat label="Rate" value={billing.amount ? `TT$${billing.amount}/mo` : '—'} />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</div>
              <span className={cn('mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', MEMBERSHIP_META[membership].className)}>
                {MEMBERSHIP_META[membership].label}
              </span>
            </div>
          </div>

          {membership === 'SUSPENDED' && latest && (
            <p className="mt-3 text-xs font-medium text-red-600">
              Suspended since {fmtLong(latest.dueDate)} · {latest.currency}{latest.amount} outstanding
            </p>
          )}
          <p className="mt-3 text-xs text-gray-400">Grace period: {GRACE_PERIOD_DAYS} days after due date</p>
        </div>

        {/* Billing history */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="text-sm font-bold text-gray-900 mb-3">Billing history</div>
          {cycles.length === 0 ? (
            <div className="text-sm text-gray-500 py-8 text-center">
              {joined
                ? <>No billing history yet — this student joined on {fmtLong(joined)}.</>
                : <>No subscription on record for this student.</>}
            </div>
          ) : (
            <ul className="space-y-3">
              {cycles.map((c, i) => {
                const status = getPaymentStatus(c);
                const meta = STATUS_META[status];
                const Icon = ICONS[status];
                return (
                  <li key={i} className="rounded-xl border border-gray-200 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-gray-900 text-sm">
                        {fmt(c.periodStart)} – {fmt(c.periodEnd)}
                      </div>
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', meta.className)}>
                        <Icon className="size-3" /> {meta.label}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Due {fmt(c.dueDate)} · Grace ends {fmt(c.gracePeriodEnd)}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-gray-500">Paid: {c.paidDate ? fmtLong(c.paidDate) : '—'}</span>
                      <span className="text-sm font-semibold text-gray-900">{c.currency}{c.amount}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}
