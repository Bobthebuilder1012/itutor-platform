'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ReceiptText, TrendingUp, LifeBuoy, Loader2,
  BookOpen, RefreshCw, Users, ExternalLink,
} from 'lucide-react';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/app/api/transactions/my/route';

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('en-TT', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtDateTime(d: string) {
  const dt = new Date(d);
  const date = dt.toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = dt.toLocaleTimeString('en-TT', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { date, time };
}

// ─── Receipt card ─────────────────────────────────────────────────────────────

function ReceiptCard({ txn }: { txn: Transaction }) {
  const { date, time } = fmtDateTime(txn.paid_at);
  const isSubscription = txn.type === 'subscription';
  const initial = (txn.class_name?.[0] ?? txn.tutor_name?.[0] ?? '?').toUpperCase();

  return (
    <div className="flex items-center gap-4 px-5 py-4 bg-card rounded-2xl border border-border hover:border-border/80 transition-colors">

      {/* Avatar / initials */}
      <div className="shrink-0">
        {txn.tutor_avatar ? (
          <Image
            src={txn.tutor_avatar}
            alt={txn.tutor_name ?? ''}
            width={44}
            height={44}
            className="size-11 rounded-xl object-cover"
          />
        ) : (
          <div className="size-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 grid place-items-center text-white font-bold text-base">
            {initial}
          </div>
        )}
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-ink text-sm truncate">
            {txn.class_name ?? 'Lesson'}
          </span>
          {/* Type badge */}
          <span className={cn(
            'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0',
            isSubscription
              ? 'bg-purple-100 text-purple-700'
              : 'bg-sky-100 text-sky-700'
          )}>
            {isSubscription ? <Users className="size-2.5" /> : <BookOpen className="size-2.5" />}
            {isSubscription ? txn.subtype : 'Lesson'}
          </span>
        </div>

        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
          {txn.tutor_name && (
            <span>{txn.tutor_name}</span>
          )}
          {txn.tutor_name && (txn.booking_start_at || txn.paid_at) && (
            <span className="text-border">·</span>
          )}
          <span>{date}</span>
          <span className="text-border">·</span>
          <span>{time}</span>
          {txn.type === 'subscription' && txn.period_start && txn.period_end && (
            <>
              <span className="text-border">·</span>
              <span className="tabular-nums">
                {new Date(txn.period_start).toLocaleDateString('en-TT', { day: 'numeric', month: 'short' })}
                {' – '}
                {new Date(txn.period_end).toLocaleDateString('en-TT', { day: 'numeric', month: 'short' })}
              </span>
            </>
          )}
          {txn.type === 'lesson' && txn.booking_start_at && (
            <>
              <span className="text-border">·</span>
              <span>Session {fmtTime(txn.booking_start_at)}</span>
            </>
          )}
        </div>
      </div>

      {/* Amount + receipt link */}
      <div className="shrink-0 text-right">
        <div className="font-bold text-ink tabular-nums">{fmtTTD(txn.amount_ttd)}</div>
        {txn.receipt_url && (
          <a
            href={txn.receipt_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-[11px] text-brand hover:underline mt-0.5"
          >
            Receipt <ExternalLink className="size-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalTtd, setTotalTtd] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/transactions/my');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setTransactions(data.transactions ?? []);
      setTotalTtd(data.total_ttd ?? 0);
    } catch {
      setError('Could not load transactions. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Group by month
  const grouped: { label: string; items: Transaction[] }[] = [];
  for (const txn of transactions) {
    const label = new Date(txn.paid_at).toLocaleDateString('en-TT', { month: 'long', year: 'numeric' });
    const last = grouped[grouped.length - 1];
    if (last?.label === label) {
      last.items.push(txn);
    } else {
      grouped.push({ label, items: [txn] });
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6 px-4">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-2xl bg-violet-500/15 grid place-items-center">
          <ReceiptText className="size-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink leading-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">Your full payment history</p>
        </div>
      </div>

      {/* ── Two stat boxes ── */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Total spent */}
        <div className="rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-500 p-5 text-white">
          <div className="flex items-center gap-2 text-xs text-white/70 font-medium mb-2">
            <TrendingUp className="size-3.5" />
            Total spent
          </div>
          {loading ? (
            <div className="h-8 w-24 rounded-lg bg-white/20 animate-pulse" />
          ) : (
            <div className="text-3xl font-bold tabular-nums">{fmtTTD(totalTtd)}</div>
          )}
          <div className="text-xs text-white/60 mt-1">
            {transactions.length} payment{transactions.length !== 1 ? 's' : ''} total
          </div>
        </div>

        {/* Contact support */}
        <Link
          href="/support"
          className="rounded-2xl border border-border bg-card p-5 flex items-center gap-4 hover:shadow-sm hover:-translate-y-0.5 transition-all"
        >
          <div className="size-12 rounded-2xl bg-sky-100 grid place-items-center shrink-0">
            <LifeBuoy className="size-6 text-sky-600" />
          </div>
          <div>
            <div className="font-semibold text-ink">Contact support</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Questions about a charge or receipt?
            </div>
          </div>
        </Link>
      </div>

      {/* ── Body ── */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">Loading transactions…</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center py-16 text-center gap-3">
          <p className="text-muted-foreground text-sm">{error}</p>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 text-sm text-brand hover:underline"
          >
            <RefreshCw className="size-3.5" /> Try again
          </button>
        </div>
      )}

      {!loading && !error && transactions.length === 0 && (
        <div className="text-center py-24 text-muted-foreground">
          <ReceiptText className="size-14 mx-auto mb-4 opacity-25" />
          <p className="font-semibold text-ink text-lg">No transactions yet</p>
          <p className="text-sm mt-1">Your payment receipts will appear here.</p>
          <Link
            href="/student/find-tutors"
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition"
          >
            Browse classes
          </Link>
        </div>
      )}

      {!loading && !error && grouped.map(({ label, items }) => (
        <div key={label} className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground tabular-nums">
              {fmtTTD(items.reduce((s, t) => s + t.amount_ttd, 0))}
            </span>
          </div>
          <div className="space-y-2">
            {items.map((txn) => (
              <ReceiptCard key={txn.id} txn={txn} />
            ))}
          </div>
        </div>
      ))}

    </div>
  );
}
