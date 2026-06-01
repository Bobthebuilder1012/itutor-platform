'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import {
  BookOpen, DollarSign, AlertTriangle, Loader2,
  CheckSquare, Square, Download, RefreshCcw,
  X, CheckCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveSub {
  id: string;
  amount_ttd: number;
  platform_fee_ttd: number;
  tutor_payout_ttd: number;
  period_start: string;
  period_end: string;
  paid_at: string;
  enrollment: { id: string; status: string; student: { id: string; full_name: string; email: string } | null } | null;
  group: { id: string; name: string; tutor_id: string; tutor: { id: string; full_name: string } | null } | null;
  payout_ledger: { id: string; status: string; batch_id: string | null; amount_ttd: number } | null;
}

interface PendingRefund {
  id: string;
  enrollment_id: string;
  status: string;
  refund_issued: boolean;
  refund_amount_ttd: number | null;
  created_at: string;
  resolved_at: string | null;
  enrollment: {
    id: string;
    status: string;
    payment_status: string;
    student: { id: string; full_name: string; email: string } | null;
    subscription_payment: { id: string; amount_ttd: number; tutor_payout_ttd: number; platform_fee_ttd: number; status: string; lunipay_transaction_id: string | null } | null;
  } | null;
  group: { id: string; name: string } | null;
  tutor: { id: string; full_name: string } | null;
}

interface CancelledLeft {
  id: string;
  status: string;
  payment_status: string;
  enrolled_at: string;
  updated_at: string;
  student: { id: string; full_name: string; email: string } | null;
  group: { id: string; name: string; tutor_id: string; tutor: { id: string; full_name: string } | null } | null;
  subscription_payment: { id: string; amount_ttd: number; status: string; paid_at: string | null } | null;
}

interface Stats {
  active_count: number;
  pending_refund_count: number;
  cancelled_left_count: number;
  unbatched_payout_ttd: number;
  pending_refund_ttd: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTTD(n: number | null | undefined) {
  if (n == null) return '—';
  return `TT$ ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-TT', { year: 'numeric', month: 'short', day: 'numeric' });
}
function normalize<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, accent }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode;
  accent: 'emerald' | 'amber' | 'sky' | 'rose';
}) {
  const map = {
    emerald: 'text-emerald-400 bg-emerald-400/10',
    amber:   'text-amber-400 bg-amber-400/10',
    sky:     'text-sky-400 bg-sky-400/10',
    rose:    'text-rose-400 bg-rose-400/10',
  };
  return (
    <div className="rounded-xl border border-white/8 p-5" style={{ background: '#161618' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider truncate">{label}</p>
          <p className="text-2xl font-bold text-white mt-1 tabular-nums">{value}</p>
          {sub && <p className="text-[11px] text-white/40 mt-0.5">{sub}</p>}
        </div>
        <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${map[accent]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function PayoutChip({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-white/30 text-xs">—</span>;
  const cfg: Record<string, string> = {
    owed:          'bg-sky-500/15 text-sky-300',
    release_ready: 'bg-emerald-500/15 text-emerald-300',
    admin_hold:    'bg-amber-500/15 text-amber-300',
    released:      'bg-purple-500/15 text-purple-300',
    reversed:      'bg-rose-500/15 text-rose-300',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg[status] ?? 'bg-white/10 text-white/60'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-semibold rounded-lg transition ${
        active
          ? 'bg-white/10 text-white'
          : 'text-white/50 hover:text-white/80 hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 overflow-x-auto" style={{ background: '#161618' }}>
      <table className="w-full">{children}</table>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center py-20 text-white/30 gap-2">
      <AlertTriangle className="size-10" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ─── Refund confirmation modal ────────────────────────────────────────────────

function RefundModal({
  removal, onClose, onSuccess,
}: {
  removal: PendingRefund;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const enrollment = normalize(removal.enrollment);
  const sp         = normalize(enrollment?.subscription_payment);
  const group      = normalize(removal.group);
  const student    = normalize(enrollment?.student);
  const tutor      = normalize(removal.tutor);
  const amount     = Number(removal.refund_amount_ttd ?? sp?.amount_ttd ?? 0);

  async function approveRefund() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/lesson-payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          removal_id: removal.id,
          enrollment_id: removal.enrollment_id,
          subscription_payment_id: sp?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Refund failed');
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl" style={{ background: '#161618' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h2 className="text-base font-bold text-white">Approve Refund</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="size-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-300">{error}</div>
          )}

          <div className="rounded-xl border border-white/8 p-4 space-y-2" style={{ background: '#0f0f10' }}>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Student</span>
              <span className="text-white font-semibold">{student?.full_name ?? '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Group</span>
              <span className="text-white">{group?.name ?? '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Tutor</span>
              <span className="text-white">{tutor?.full_name ?? '—'}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-white/8 pt-2 mt-2">
              <span className="text-white/70">Refund amount</span>
              <span className="text-rose-300 tabular-nums">{fmtTTD(amount)}</span>
            </div>
            <div className="text-xs text-amber-300/80 mt-2">
              {sp?.lunipay_transaction_id
                ? 'Refund will be processed via LuniPay. If the payout was already released to the tutor, the amount will be recovered from future earnings.'
                : 'No LuniPay transaction found. The refund must be processed manually.'}
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-white/8">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-white/10 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={approveRefund}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
            {loading ? 'Processing…' : 'Approve Refund'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Batch modal ──────────────────────────────────────────────────────────────

function BatchModal({
  selected, allActive, onClose, onSuccess,
}: {
  selected: Set<string>;
  allActive: ActiveSub[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const rows = allActive.filter((sp) => selected.has(sp.id));
  const totalPayout    = rows.reduce((s, r) => s + Number(r.tutor_payout_ttd ?? 0), 0);
  const totalPlatform  = rows.reduce((s, r) => s + Number(r.platform_fee_ttd ?? 0), 0);
  const totalAmount    = rows.reduce((s, r) => s + Number(r.amount_ttd ?? 0), 0);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function submit() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/payouts/create-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription_payment_ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Batch creation failed');

      if (data.csv) {
        const blob = new Blob([data.csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = data.filename ?? 'lesson-payouts.csv';
        a.click();
        URL.revokeObjectURL(url);
      }
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl" style={{ background: '#161618' }}>
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h2 className="text-base font-bold text-white">Transfer to CSV Batch</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="size-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-300">{error}</div>
          )}

          <div className="rounded-xl border border-white/8 p-4 space-y-2" style={{ background: '#0f0f10' }}>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Selected payments</span>
              <span className="text-white font-semibold">{rows.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Total collected</span>
              <span className="text-white tabular-nums">{fmtTTD(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Platform commission</span>
              <span className="text-rose-300 tabular-nums">−{fmtTTD(totalPlatform)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-white/8 pt-2 mt-2">
              <span className="text-white/70">Tutor payout total</span>
              <span className="text-emerald-300 tabular-nums">{fmtTTD(totalPayout)}</span>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {rows.map((r) => {
              const enrollment = normalize(r.enrollment);
              const group      = normalize(r.group);
              const student    = normalize(enrollment?.student);
              const tutor      = normalize(group?.tutor);
              return (
                <div key={r.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white/4 text-xs">
                  <div className="min-w-0">
                    <p className="text-white/70 truncate">{group?.name ?? '—'}</p>
                    <p className="text-white/40">{student?.full_name ?? '—'} · {tutor?.full_name ?? '—'}</p>
                  </div>
                  <span className="text-emerald-300 tabular-nums ml-3 shrink-0">{fmtTTD(r.tutor_payout_ttd)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-white/8">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-white/10 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading || rows.length === 0}
            className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {loading ? 'Creating…' : 'Create & Download CSV'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LessonPaymentsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);

  const [tab, setTab]         = useState<'active' | 'pending' | 'cancelled'>('active');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [active, setActive]           = useState<ActiveSub[]>([]);
  const [pendingRefunds, setPending]  = useState<PendingRefund[]>([]);
  const [cancelledLeft, setCancelled] = useState<CancelledLeft[]>([]);
  const [stats, setStats]             = useState<Stats | null>(null);

  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState<PendingRefund | null>(null);

  // ── Auth guard ───────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', user.id)
        .single();
      if (profile?.role !== 'admin') { router.push('/login'); return; }
      if (isEmailManagementOnlyAdmin(profile.email)) { router.replace('/admin/emails'); return; }
      setAuthLoading(false);
    })();
  }, []);

  // ── Load data ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/admin/lesson-payments');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setActive(data.active ?? []);
      setPending(data.pending_refunds ?? []);
      setCancelled(data.cancelled_left ?? []);
      setStats(data.stats ?? null);
      setSelected(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!authLoading) loadData(); }, [authLoading, loadData]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === active.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(active.map((r) => r.id)));
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f10' }}>
        <Loader2 className="size-6 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#0f0f10', color: '#fff' }}>
      <div className="max-w-6xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Lesson Payments</h1>
            <p className="text-sm text-white/40 mt-0.5">Subscription billing, pending refunds, and cancellations</p>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-sm flex items-center gap-1.5"
          >
            <RefreshCcw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-300">{error}</div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Active subscriptions" value={String(stats?.active_count ?? '—')}
            sub="Enrolled & paid" icon={<BookOpen className="size-4" />} accent="emerald" />
          <StatCard label="Unbatched payout" value={fmtTTD(stats?.unbatched_payout_ttd)}
            sub="Pending batch transfer" icon={<DollarSign className="size-4" />} accent="sky" />
          <StatCard label="Pending refunds" value={String(stats?.pending_refund_count ?? '—')}
            sub={fmtTTD(stats?.pending_refund_ttd)} icon={<AlertTriangle className="size-4" />} accent="amber" />
          <StatCard label="Cancelled — Left" value={String(stats?.cancelled_left_count ?? '—')}
            sub="Voluntary by student" icon={<X className="size-4" />} accent="rose" />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl border border-white/8 w-fit" style={{ background: '#161618' }}>
          <Tab active={tab === 'active'}    onClick={() => setTab('active')}>
            Active Subscriptions {stats ? `(${stats.active_count})` : ''}
          </Tab>
          <Tab active={tab === 'pending'}   onClick={() => setTab('pending')}>
            Pending Refunds {stats ? `(${stats.pending_refund_count})` : ''}
          </Tab>
          <Tab active={tab === 'cancelled'} onClick={() => setTab('cancelled')}>
            Cancelled — Left {stats ? `(${stats.cancelled_left_count})` : ''}
          </Tab>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-white/30">
            <Loader2 className="size-5 animate-spin" /><span className="text-sm">Loading…</span>
          </div>
        ) : (
          <>
            {/* Active Subscriptions */}
            {tab === 'active' && (
              <div className="space-y-3">
                {active.length > 0 && (
                  <div className="flex items-center justify-between">
                    <button onClick={toggleAll} className="flex items-center gap-2 text-sm text-white/50 hover:text-white">
                      {selected.size === active.length ? <CheckSquare className="size-4 text-emerald-400" /> : <Square className="size-4" />}
                      {selected.size === active.length ? 'Deselect all' : 'Select all'}
                      {selected.size > 0 && <span className="text-white/30">({selected.size} selected)</span>}
                    </button>
                    {selected.size > 0 && (
                      <button onClick={() => setBatchOpen(true)} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center gap-2">
                        <Download className="size-4" /> Transfer to CSV Batch ({selected.size})
                      </button>
                    )}
                  </div>
                )}
                {active.length === 0 ? <EmptyState message="No active subscription payments to batch." /> : (
                  <Table>
                    <thead>
                      <tr className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                        <th className="px-4 py-3 text-left w-8" />
                        <th className="px-4 py-3 text-left">Group / Student</th>
                        <th className="px-4 py-3 text-left">Tutor</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-right">Payout</th>
                        <th className="px-4 py-3 text-left">Period</th>
                        <th className="px-4 py-3 text-center">Ledger</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {active.map((sp) => {
                        const enrollment = normalize(sp.enrollment);
                        const group      = normalize(sp.group);
                        const student    = normalize(enrollment?.student);
                        const tutor      = normalize(group?.tutor);
                        const ledger     = normalize(sp.payout_ledger);
                        const isSelected = selected.has(sp.id);
                        return (
                          <tr key={sp.id} onClick={() => toggleOne(sp.id)}
                            className={`cursor-pointer transition ${isSelected ? 'bg-emerald-500/8' : 'hover:bg-white/3'}`}>
                            <td className="px-4 py-3">
                              {isSelected ? <CheckSquare className="size-4 text-emerald-400" /> : <Square className="size-4 text-white/20" />}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm font-semibold text-white">{group?.name ?? '—'}</p>
                              <p className="text-xs text-white/40">{student?.full_name ?? '—'}</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-white/70">{tutor?.full_name ?? '—'}</td>
                            <td className="px-4 py-3 text-right text-sm text-white tabular-nums">{fmtTTD(sp.amount_ttd)}</td>
                            <td className="px-4 py-3 text-right text-sm text-emerald-300 tabular-nums">{fmtTTD(sp.tutor_payout_ttd)}</td>
                            <td className="px-4 py-3 text-xs text-white/40">{fmtDate(sp.period_start)} → {fmtDate(sp.period_end)}</td>
                            <td className="px-4 py-3 text-center"><PayoutChip status={ledger?.status} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </div>
            )}

            {/* Pending Refunds */}
            {tab === 'pending' && (
              pendingRefunds.length === 0 ? <EmptyState message="No pending refunds to approve." /> : (
                <Table>
                  <thead>
                    <tr className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Group / Student</th>
                      <th className="px-4 py-3 text-left">Tutor</th>
                      <th className="px-4 py-3 text-right">Refund</th>
                      <th className="px-4 py-3 text-left">Removed</th>
                      <th className="px-4 py-3 text-center w-24">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pendingRefunds.map((r) => {
                      const enrollment = normalize(r.enrollment);
                      const sp         = normalize(enrollment?.subscription_payment);
                      const group      = normalize(r.group);
                      const student    = normalize(enrollment?.student);
                      const tutor      = normalize(r.tutor);
                      return (
                        <tr key={r.id} className="hover:bg-white/3">
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-white">{group?.name ?? '—'}</p>
                            <p className="text-xs text-white/40">{student?.full_name ?? '—'}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-white/70">{tutor?.full_name ?? '—'}</td>
                          <td className="px-4 py-3 text-right text-sm text-amber-300 tabular-nums">{fmtTTD(r.refund_amount_ttd)}</td>
                          <td className="px-4 py-3 text-xs text-white/40">{fmtDate(r.created_at)}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => setRefundTarget(r)}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition"
                            >
                              Issue Refund
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )
            )}

            {/* Cancelled — Left */}
            {tab === 'cancelled' && (
              cancelledLeft.length === 0 ? <EmptyState message="No voluntarily cancelled subscriptions." /> : (
                <Table>
                  <thead>
                    <tr className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Group / Student</th>
                      <th className="px-4 py-3 text-left">Tutor</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-center">Payment Status</th>
                      <th className="px-4 py-3 text-left">Enrolled</th>
                      <th className="px-4 py-3 text-left">Cancelled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {cancelledLeft.map((e) => {
                      const group   = normalize(e.group);
                      const student = normalize(e.student);
                      const tutor   = normalize(group?.tutor);
                      const sp      = normalize(e.subscription_payment);
                      return (
                        <tr key={e.id} className="hover:bg-white/3">
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-white">{group?.name ?? '—'}</p>
                            <p className="text-xs text-white/40">{student?.full_name ?? '—'}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-white/70">{tutor?.full_name ?? '—'}</td>
                          <td className="px-4 py-3 text-right text-sm text-white/70 tabular-nums">{fmtTTD(sp?.amount_ttd)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              e.payment_status === 'REFUNDED'  ? 'bg-rose-500/15 text-rose-300' :
                              e.payment_status === 'PAID'      ? 'bg-sky-500/15 text-sky-300' :
                                                                 'bg-white/10 text-white/50'}`}>
                              {e.payment_status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-white/40">{fmtDate(e.enrolled_at)}</td>
                          <td className="px-4 py-3 text-xs text-white/40">{fmtDate(e.updated_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )
            )}
          </>
        )}
      </div>

      {batchOpen && (
        <BatchModal selected={selected} allActive={active}
          onClose={() => setBatchOpen(false)}
          onSuccess={() => { setBatchOpen(false); loadData(); }} />
      )}

      {refundTarget && (
        <RefundModal removal={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSuccess={() => { setRefundTarget(null); loadData(); }} />
      )}
    </div>
  );
}
