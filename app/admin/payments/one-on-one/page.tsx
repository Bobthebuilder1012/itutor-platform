'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import {
  DollarSign, AlertTriangle, Loader2,
  CheckSquare, Square, Download, RefreshCcw,
  X, CheckCircle, FileSpreadsheet, TrendingDown,
  Clock, Ban, Eye, PauseCircle, XCircle, Users,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KPIs {
  total_payments_ttd: number;
  total_payments_count: number;
  total_refunded_ttd: number;
  unbatched_payout_ttd: number;
  release_ready_ttd: number;
  owed_payout_ttd: number;
  pending_refunds_count: number;
  pending_refunds_ttd: number;
  cancelled_count: number;
  noshow_count: number;
  batch_failed_count: number;
}

interface PaymentRow {
  id: string;
  payment_id: string;
  lunipay_transaction_id: string | null;
  amount_ttd: number;
  platform_fee_ttd: number;
  tutor_payout_ttd: number;
  total_refunded_ttd: number;
  retained_amount_ttd: number;
  payment_status: string;
  paid_at: string | null;
  refunded_at: string | null;
  booking_id: string | null;
  booking_status: string | null;
  student_id: string | null;
  student_name: string | null;
  student_email: string | null;
  tutor_id: string | null;
  tutor_name: string | null;
  tutor_email: string | null;
  session_id: string | null;
  scheduled_at: string | null;
  session_status: string | null;
  subject: string | null;
  payout_status: string | null;
  payout_ledger_id: string | null;
  payout_batch_id: string | null;
  has_noshow_claim: boolean;
  noshow_status: string | null;
  noshow_verdict: string | null;
  has_payout_case: boolean;
  payout_case_id: string | null;
  payout_case_status: string | null;
}

interface PendingRefundRow extends PaymentRow {
  refund_reason: string;
  recommended_refund_ttd: number;
  retained_ttd: number;
}

interface CancellationRow {
  event_id: string;
  booking_id: string | null;
  session_id: string | null;
  student_id: string | null;
  student_name: string | null;
  tutor_id: string | null;
  tutor_name: string | null;
  subject: string | null;
  session_time: string | null;
  cancelled_at: string;
  cancelled_by: string;
  hours_before: number;
  is_late: boolean;
  is_super_late: boolean;
  was_fee_applied: boolean;
  fee_amount_ttd: number;
  recommended_action: string;
  payment_amount: number;
  platform_fee_ttd: number;
  tutor_payout_ttd: number;
  refund_recommended: boolean;
  tutor_payout_recommended: number;
  booking_status: string | null;
  booking_payment_status: string | null;
}

interface NoshowRow {
  claim_id: string;
  session_id: string;
  booking_id: string | null;
  student_name: string | null;
  tutor_name: string | null;
  scheduled_at: string | null;
  filed_by: string;
  filed_at: string;
  is_within_filing_window: boolean;
  tutor_responded: boolean;
  response_deadline: string;
  defendant_response: string | null;
  status: string;
  admin_verdict: string | null;
  admin_decided_at: string | null;
  admin_notes: string | null;
  payout_status: string | null;
  payout_ledger_id: string | null;
  payout_case_id: string | null;
  refund_issued: boolean;
}

interface ReadyForCsvRow {
  ledger_id: string;
  tutor_id: string;
  tutor_name: string | null;
  tutor_email: string | null;
  session_id: string;
  scheduled_at: string | null;
  amount_ttd: number;
  payment_date: string | null;
  bank_name: string | null;
  branch: string | null;
  account_number: string | null;
  account_type: string | null;
  has_bank_details: boolean;
  ledger_created_at: string;
}

interface BatchFailedRow {
  batch_id: string;
  generated_at: string;
  cancelled_at: string | null;
  total_amount_ttd: number;
  line_count: number;
  status: string;
  csv_filename: string | null;
  notes: string | null;
}

interface UnofficialRow {
  tutor_id: string;
  tutor_name: string | null;
  email: string | null;
  bank_name: string | null;
  branch: string | null;
  account_number: string | null;
  account_type: string | null;
  gross_payout_ttd: number;
  pending_debt_ttd: number;
  net_payout_ttd: number;
}

interface PageData {
  kpis: KPIs;
  all_payments: PaymentRow[];
  pending_refunds: PendingRefundRow[];
  cancellations: CancellationRow[];
  noshows: NoshowRow[];
  ready_for_csv: ReadyForCsvRow[];
  batch_failed: BatchFailedRow[];
  unofficial_csv: UnofficialRow[];
  unofficial_totals: { total_gross_ttd: number; total_debt_ttd: number; total_net_ttd: number };
}

type TabId = 'all' | 'pending' | 'cancelled' | 'noshow' | 'ready' | 'failed' | 'unofficial';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTTD(n: number | null | undefined) {
  if (n == null) return '—';
  return `TT$ ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-TT', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-TT', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Shared UI components ─────────────────────────────────────────────────────

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

function PaymentStatusChip({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-white/30 text-xs">—</span>;
  const cfg: Record<string, string> = {
    succeeded:           'bg-emerald-500/15 text-emerald-300',
    partially_refunded:  'bg-amber-500/15 text-amber-300',
    refunded:            'bg-rose-500/15 text-rose-300',
    failed:              'bg-rose-600/20 text-rose-400',
    pending:             'bg-sky-500/15 text-sky-300',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg[status] ?? 'bg-white/10 text-white/60'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function NoshowStatusChip({ status, verdict }: { status: string; verdict: string | null }) {
  if (verdict) {
    if (verdict === 'student_noshow') return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300">Student No-show</span>;
    if (verdict === 'tutor_noshow')   return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300">Tutor No-show</span>;
    if (verdict === 'tie')            return <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-300">Tie / Mutual</span>;
  }
  const cfg: Record<string, string> = {
    resolved:           'bg-emerald-500/15 text-emerald-300',
    escalated:          'bg-rose-500/15 text-rose-300',
    pending:            'bg-amber-500/15 text-amber-300',
    awaiting_response:  'bg-amber-500/15 text-amber-300',
    open:               'bg-sky-500/15 text-sky-300',
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

function DataTable({ children }: { children: React.ReactNode }) {
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

// ─── Refund Modal ─────────────────────────────────────────────────────────────

type RefundType = 'full' | 'half' | 'reject';

function RefundModal({
  row,
  onClose,
  onSuccess,
}: {
  row: PendingRefundRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [refundType, setRefundType] = useState<RefundType>('full');

  const fullAmount = row.recommended_refund_ttd;
  const halfAmount = Math.round(fullAmount * 50) / 100;

  async function submit() {
    if (refundType === 'reject') { onSuccess(); return; }
    setLoading(true); setError('');
    try {
      const amount_ttd = refundType === 'half' ? halfAmount : fullAmount;
      const res = await fetch(`/api/admin/payments/${row.payment_id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_ttd, reason: 'admin_manual' }),
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
          <h2 className="text-base font-bold text-white">Issue Refund</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="size-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-300">{error}</div>
          )}

          <div className="rounded-xl border border-white/8 p-4 space-y-2" style={{ background: '#0f0f10' }}>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Student</span>
              <span className="text-white font-semibold">{row.student_name ?? '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Tutor</span>
              <span className="text-white">{row.tutor_name ?? '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Session</span>
              <span className="text-white">{fmtDate(row.scheduled_at)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Reason</span>
              <span className="text-amber-300 capitalize">{row.refund_reason.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-white/8 pt-2 mt-2">
              <span className="text-white/70">Recommended refund</span>
              <span className="text-rose-300 tabular-nums">{fmtTTD(fullAmount)}</span>
            </div>
            {row.retained_ttd > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-white/40">Already retained</span>
                <span className="text-white/60 tabular-nums">{fmtTTD(row.retained_ttd)}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Refund amount</p>
            {([
              { key: 'full' as RefundType, label: 'Full refund', amount: fullAmount, color: 'rose' },
              { key: 'half' as RefundType, label: '50% refund', amount: halfAmount, color: 'amber' },
              { key: 'reject' as RefundType, label: 'Reject (no refund)', amount: null, color: 'white' },
            ] as const).map(({ key, label, amount, color }) => (
              <button
                key={key}
                onClick={() => setRefundType(key)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition text-sm font-semibold ${
                  refundType === key
                    ? 'border-white/20 bg-white/8 text-white'
                    : 'border-white/6 bg-white/2 text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  {refundType === key
                    ? <CheckCircle className="size-4 text-emerald-400" />
                    : <div className="size-4 rounded-full border border-white/20" />}
                  <span>{label}</span>
                </div>
                {amount != null && (
                  <span className={`tabular-nums text-${color}-300`}>{fmtTTD(amount)}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-white/8">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-white/10 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className={`flex-1 px-4 py-2 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition ${
              refundType === 'reject'
                ? 'bg-white/10 hover:bg-white/15'
                : 'bg-rose-600 hover:bg-rose-500'
            }`}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
            {loading ? 'Processing…' : refundType === 'reject' ? 'Confirm Rejection' : 'Issue Refund'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── No-show Resolve Modal ────────────────────────────────────────────────────

type NoshowVerdict = 'student_noshow' | 'tutor_noshow' | 'tie';

function NoshowModal({
  claim,
  onClose,
  onSuccess,
}: {
  claim: NoshowRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [verdict, setVerdict]     = useState<NoshowVerdict | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function submit() {
    if (!verdict) { setError('Please select a verdict before submitting.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/noshow/${claim.session_id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: verdict, adminNotes: adminNotes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Resolve failed');
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const verdictOptions: { key: NoshowVerdict; label: string; desc: string; color: string }[] = [
    {
      key: 'student_noshow',
      label: 'Student No-show',
      desc: 'No refund. Tutor payout proceeds. Student receives a strike.',
      color: 'amber',
    },
    {
      key: 'tutor_noshow',
      label: 'Tutor No-show',
      desc: 'Full refund to student. Tutor strike + 1-star system rating.',
      color: 'rose',
    },
    {
      key: 'tie',
      label: 'Tie / Mutual Non-completion',
      desc: 'Full refund. No penalties for either side.',
      color: 'purple',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl" style={{ background: '#161618' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h2 className="text-base font-bold text-white">Resolve No-show Claim</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="size-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-300">{error}</div>
          )}

          <div className="rounded-xl border border-white/8 p-4 space-y-2" style={{ background: '#0f0f10' }}>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Student</span>
              <span className="text-white font-semibold">{claim.student_name ?? '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Tutor</span>
              <span className="text-white">{claim.tutor_name ?? '—'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Scheduled</span>
              <span className="text-white">{fmtDateTime(claim.scheduled_at)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Filed by</span>
              <span className="text-white capitalize">{claim.filed_by}</span>
            </div>
            {claim.defendant_response && (
              <div className="border-t border-white/8 pt-2 mt-2">
                <p className="text-xs text-white/40 mb-1">Tutor response</p>
                <p className="text-sm text-white/70 leading-relaxed">{claim.defendant_response}</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Verdict</p>
            {verdictOptions.map(({ key, label, desc, color }) => (
              <button
                key={key}
                onClick={() => setVerdict(key)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition ${
                  verdict === key
                    ? 'border-white/20 bg-white/8'
                    : 'border-white/6 bg-white/2 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {verdict === key
                    ? <CheckCircle className="size-4 text-emerald-400 shrink-0" />
                    : <div className="size-4 rounded-full border border-white/20 shrink-0" />}
                  <span className={`text-sm font-semibold text-${color}-300`}>{label}</span>
                </div>
                <p className="text-xs text-white/40 ml-6">{desc}</p>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">Admin notes (optional)</label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Add context for this decision…"
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/4 text-sm text-white placeholder-white/20 resize-none focus:outline-none focus:border-white/20"
            />
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-white/8">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-white/10 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading || !verdict}
            className="flex-1 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
            {loading ? 'Resolving…' : 'Submit Verdict'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Batch CSV Modal ──────────────────────────────────────────────────────────

function BatchModal({
  selected,
  allReady,
  onClose,
  onSuccess,
}: {
  selected: Set<string>;
  allReady: ReadyForCsvRow[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const rows          = allReady.filter((r) => selected.has(r.ledger_id));
  const totalPayout   = rows.reduce((s, r) => s + Number(r.amount_ttd), 0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function submit() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/payouts/create-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout_ledger_ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Batch creation failed');

      if (data.csv) {
        const blob = new Blob([data.csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = data.filename ?? 'one-on-one-payouts.csv';
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
          <h2 className="text-base font-bold text-white">Generate Batch CSV</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="size-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-300">{error}</div>
          )}

          <div className="rounded-xl border border-white/8 p-4 space-y-2" style={{ background: '#0f0f10' }}>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Selected payouts</span>
              <span className="text-white font-semibold">{rows.length}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-white/8 pt-2 mt-2">
              <span className="text-white/70">Total payout</span>
              <span className="text-emerald-300 tabular-nums">{fmtTTD(totalPayout)}</span>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {rows.map((r) => (
              <div key={r.ledger_id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white/4 text-xs">
                <div className="min-w-0">
                  <p className="text-white/70 truncate">{r.tutor_name ?? '—'}</p>
                  <p className="text-white/40">{fmtDate(r.scheduled_at)} · {r.bank_name ?? 'No bank on file'}</p>
                </div>
                <span className="text-emerald-300 tabular-nums ml-3 shrink-0">{fmtTTD(r.amount_ttd)}</span>
              </div>
            ))}
          </div>

          {rows.some((r) => !r.has_bank_details) && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
              <span>Some tutors have no bank details on file. Their rows will export with blank account fields.</span>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-white/8">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-white/10 text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading || rows.length === 0}
            className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition"
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

export default function OneOnOnePaymentsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);

  const [tab, setTab]         = useState<TabId>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [data, setData] = useState<PageData | null>(null);

  // Selection for ready-for-csv tab
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);

  // Modals
  const [refundTarget, setRefundTarget] = useState<PendingRefundRow | null>(null);
  const [noshowTarget, setNoshowTarget] = useState<NoshowRow | null>(null);
  // Track which cancellation rows have already had a strike issued this session
  const [strikesIssued, setStrikesIssued] = useState<Set<string>>(new Set());

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
      const res  = await fetch('/api/admin/payments/one-on-one');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setData(json as PageData);
      setSelected(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!authLoading) loadData(); }, [authLoading, loadData]);

  // ── Selection helpers ────────────────────────────────────────────────────
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const allIds = data?.ready_for_csv.map((r) => r.ledger_id) ?? [];
    if (selected.size === allIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  }

  // ── Unofficial CSV download ──────────────────────────────────────────────
  function downloadUnofficialCsv() {
    const rows = ['tutor_name,bank_name,branch,account_number,account_type,gross_payout_ttd,pending_debt_ttd,net_payout_ttd'];
    function cell(v: string | number | null | undefined): string {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }
    for (const t of data?.unofficial_csv ?? []) {
      rows.push([
        cell(t.tutor_name), cell(t.bank_name), cell(t.branch),
        cell(t.account_number), cell(t.account_type),
        cell(t.gross_payout_ttd.toFixed(2)),
        cell(t.pending_debt_ttd.toFixed(2)),
        cell(t.net_payout_ttd.toFixed(2)),
      ].join(','));
    }
    const csv  = rows.join('\r\n') + '\r\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `itutor-1on1-unofficial-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const kpis = data?.kpis;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f10' }}>
        <Loader2 className="size-6 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#0f0f10', color: '#fff' }}>
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">One-on-One Payments</h1>
            <p className="text-sm text-white/40 mt-0.5">Session payments, refunds, no-shows, and tutor payouts</p>
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

        {/* KPI Stats — 4 cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Payments"
            value={fmtTTD(kpis?.total_payments_ttd)}
            sub={`${kpis?.total_payments_count ?? '—'} payments`}
            icon={<DollarSign className="size-4" />}
            accent="emerald"
          />
          <StatCard
            label="Unbatched Payout"
            value={fmtTTD(kpis?.unbatched_payout_ttd)}
            sub="Release-ready, no batch"
            icon={<Download className="size-4" />}
            accent="sky"
          />
          <StatCard
            label="Pending Refunds"
            value={String(kpis?.pending_refunds_count ?? '—')}
            sub={fmtTTD(kpis?.pending_refunds_ttd)}
            icon={<AlertTriangle className="size-4" />}
            accent="amber"
          />
          <StatCard
            label="No-show Claims"
            value={String(kpis?.noshow_count ?? '—')}
            sub={`${kpis?.cancelled_count ?? '—'} cancelled`}
            icon={<Users className="size-4" />}
            accent="rose"
          />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 flex-wrap p-1 rounded-xl border border-white/8 w-fit" style={{ background: '#161618' }}>
          <Tab active={tab === 'all'} onClick={() => setTab('all')}>
            All Payments {kpis ? `(${kpis.total_payments_count})` : ''}
          </Tab>
          <Tab active={tab === 'pending'} onClick={() => setTab('pending')}>
            Pending Refunds {kpis ? `(${kpis.pending_refunds_count})` : ''}
          </Tab>
          <Tab active={tab === 'cancelled'} onClick={() => setTab('cancelled')}>
            Canceled {kpis ? `(${kpis.cancelled_count})` : ''}
          </Tab>
          <Tab active={tab === 'noshow'} onClick={() => setTab('noshow')}>
            No-Show {kpis ? `(${kpis.noshow_count})` : ''}
          </Tab>
          <Tab active={tab === 'ready'} onClick={() => setTab('ready')}>
            Ready for CSV {data ? `(${data.ready_for_csv.length})` : ''}
          </Tab>
          <Tab active={tab === 'failed'} onClick={() => setTab('failed')}>
            Batch Failed {kpis ? `(${kpis.batch_failed_count})` : ''}
          </Tab>
          <Tab active={tab === 'unofficial'} onClick={() => setTab('unofficial')}>
            Unofficial CSV
          </Tab>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-white/30">
            <Loader2 className="size-5 animate-spin" /><span className="text-sm">Loading…</span>
          </div>
        ) : (
          <>
            {/* ── ALL PAYMENTS ── */}
            {tab === 'all' && (
              !data?.all_payments.length ? <EmptyState message="No payments found." /> : (
                <DataTable>
                  <thead>
                    <tr className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Student</th>
                      <th className="px-4 py-3 text-left">Tutor</th>
                      <th className="px-4 py-3 text-left">Session Date</th>
                      <th className="px-4 py-3 text-left">Subject</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Platform Fee</th>
                      <th className="px-4 py-3 text-right">Payout</th>
                      <th className="px-4 py-3 text-center">Payment</th>
                      <th className="px-4 py-3 text-center">Payout Status</th>
                      <th className="px-4 py-3 text-center w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.all_payments.map((row) => (
                      <tr key={row.id} className="hover:bg-white/3">
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-white">{row.student_name ?? '—'}</p>
                          {row.student_email && <p className="text-xs text-white/40">{row.student_email}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/70">{row.tutor_name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-white/50">{fmtDate(row.scheduled_at)}</td>
                        <td className="px-4 py-3 text-sm text-white/60">{row.subject ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-sm text-white tabular-nums">{fmtTTD(row.amount_ttd)}</td>
                        <td className="px-4 py-3 text-right text-xs text-white/40 tabular-nums">{fmtTTD(row.platform_fee_ttd)}</td>
                        <td className="px-4 py-3 text-right text-sm text-emerald-300 tabular-nums">{fmtTTD(row.tutor_payout_ttd)}</td>
                        <td className="px-4 py-3 text-center"><PaymentStatusChip status={row.payment_status} /></td>
                        <td className="px-4 py-3 text-center"><PayoutChip status={row.payout_status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              title="View details"
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition"
                            >
                              <Eye className="size-3.5" />
                            </button>
                            {!row.has_payout_case && row.payout_status !== 'admin_hold' && (
                              <button
                                title="Place hold"
                                className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition"
                              >
                                <PauseCircle className="size-3.5" />
                              </button>
                            )}
                            {['succeeded', 'partially_refunded'].includes(row.payment_status) && (
                              <button
                                title="Refund"
                                onClick={() => {
                                  // Build a synthetic pending refund row for the modal
                                  setRefundTarget({
                                    ...row,
                                    refund_reason: 'admin_manual',
                                    recommended_refund_ttd: Math.max(0, row.amount_ttd - row.total_refunded_ttd),
                                    retained_ttd: row.retained_amount_ttd,
                                  });
                                }}
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                              >
                                <XCircle className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )
            )}

            {/* ── PENDING REFUNDS ── */}
            {tab === 'pending' && (
              !data?.pending_refunds.length ? <EmptyState message="No pending refunds to approve." /> : (
                <DataTable>
                  <thead>
                    <tr className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Student</th>
                      <th className="px-4 py-3 text-left">Tutor</th>
                      <th className="px-4 py-3 text-left">Session</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Recommended</th>
                      <th className="px-4 py-3 text-right">Retained</th>
                      <th className="px-4 py-3 text-left">Reason</th>
                      <th className="px-4 py-3 text-center w-36">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.pending_refunds.map((row) => (
                      <tr key={row.id} className="hover:bg-white/3">
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-white">{row.student_name ?? '—'}</p>
                          {row.student_email && <p className="text-xs text-white/40">{row.student_email}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/70">{row.tutor_name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-white/50">{fmtDate(row.scheduled_at)}</td>
                        <td className="px-4 py-3 text-right text-sm text-white tabular-nums">{fmtTTD(row.amount_ttd)}</td>
                        <td className="px-4 py-3 text-right text-sm text-rose-300 tabular-nums">{fmtTTD(row.recommended_refund_ttd)}</td>
                        <td className="px-4 py-3 text-right text-xs text-white/40 tabular-nums">
                          {row.retained_ttd > 0 ? fmtTTD(row.retained_ttd) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-amber-300 capitalize">{row.refund_reason.replace(/_/g, ' ')}</span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setRefundTarget(row)}
                            className="w-full px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition"
                          >
                            Issue Refund
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )
            )}

            {/* ── CANCELED ── */}
            {tab === 'cancelled' && (
              !data?.cancellations.length ? <EmptyState message="No cancellation events found." /> : (
                <DataTable>
                  <thead>
                    <tr className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Student</th>
                      <th className="px-4 py-3 text-left">Tutor</th>
                      <th className="px-4 py-3 text-left">Scheduled At</th>
                      <th className="px-4 py-3 text-left">Canceled By</th>
                      <th className="px-4 py-3 text-right">Hrs Before</th>
                      <th className="px-4 py-3 text-left">Classification</th>
                      <th className="px-4 py-3 text-left">Recommended Action</th>
                      <th className="px-4 py-3 text-center w-40">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.cancellations.map((row) => (
                      <tr key={row.event_id} className="hover:bg-white/3">
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-white">{row.student_name ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-white/70">{row.tutor_name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-white/50">{fmtDateTime(row.session_time)}</td>
                        <td className="px-4 py-3 text-sm capitalize text-white/60">{row.cancelled_by}</td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-white/60">
                          {row.hours_before > 0 ? `${row.hours_before.toFixed(1)}h` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {row.is_late ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300">Late cancel (&lt;12h)</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/8 text-white/50">Early cancel</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-white/50 capitalize">
                          {row.recommended_action.replace(/_/g, ' ')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Refunds for student cancellations are processed automatically — no admin action needed */}
                            {row.booking_payment_status === 'REFUNDED' || row.booking_payment_status === 'PARTIALLY_REFUNDED' ? (
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 text-[11px] font-bold">Auto-refunded</span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg bg-white/5 text-white/30 text-[11px]">Pending refund</span>
                            )}
                            {row.is_late && row.student_id && (
                              strikesIssued.has(row.event_id) ? (
                                <span className="px-2.5 py-1 rounded-lg bg-white/5 text-white/30 text-[11px] font-bold cursor-default">
                                  Strike issued
                                </span>
                              ) : (
                                <button
                                  onClick={async () => {
                                    if (!confirm(`Issue a reliability strike to ${row.student_name ?? 'this student'} for a late cancellation?`)) return;
                                    const res = await fetch('/api/admin/student-strikes', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        student_id: row.student_id,
                                        reason: 'student_noshow',
                                        session_id: row.session_id,
                                        booking_id: row.booking_id,
                                        notes: 'Late cancellation — issued from One-on-One Payments admin panel',
                                      }),
                                    });
                                    if (res.ok) {
                                      setStrikesIssued((prev) => new Set([...prev, row.event_id]));
                                    } else {
                                      alert('Failed to issue strike.');
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[11px] font-bold transition"
                                >
                                  Issue Strike
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )
            )}

            {/* ── NO-SHOW ── */}
            {tab === 'noshow' && (
              !data?.noshows.length ? <EmptyState message="No no-show claims found." /> : (
                <DataTable>
                  <thead>
                    <tr className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Student</th>
                      <th className="px-4 py-3 text-left">Tutor</th>
                      <th className="px-4 py-3 text-left">Scheduled At</th>
                      <th className="px-4 py-3 text-left">Filed By</th>
                      <th className="px-4 py-3 text-left">Filed At</th>
                      <th className="px-4 py-3 text-left">Tutor Response</th>
                      <th className="px-4 py-3 text-left">Verdict</th>
                      <th className="px-4 py-3 text-center">Payout</th>
                      <th className="px-4 py-3 text-center w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.noshows.map((row) => (
                      <tr key={row.claim_id} className="hover:bg-white/3">
                        <td className="px-4 py-3 text-sm font-semibold text-white">{row.student_name ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-white/70">{row.tutor_name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-white/50">{fmtDateTime(row.scheduled_at)}</td>
                        <td className="px-4 py-3 text-sm capitalize text-white/60">{row.filed_by}</td>
                        <td className="px-4 py-3 text-xs text-white/40">{fmtDate(row.filed_at)}</td>
                        <td className="px-4 py-3">
                          {row.tutor_responded ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300">Responded</span>
                          ) : row.is_within_filing_window ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300">Awaiting</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/8 text-white/40">No response</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <NoshowStatusChip status={row.status} verdict={row.admin_verdict} />
                        </td>
                        <td className="px-4 py-3 text-center"><PayoutChip status={row.payout_status} /></td>
                        <td className="px-4 py-3 text-center">
                          {row.status !== 'resolved' && (
                            <button
                              onClick={() => setNoshowTarget(row)}
                              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition"
                            >
                              Resolve
                            </button>
                          )}
                          {row.status === 'resolved' && (
                            <span className="text-xs text-white/30">Done</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )
            )}

            {/* ── READY FOR CSV ── */}
            {tab === 'ready' && (
              <div className="space-y-3">
                {(data?.ready_for_csv.length ?? 0) > 0 && (
                  <div className="flex items-center justify-between">
                    <button onClick={toggleAll} className="flex items-center gap-2 text-sm text-white/50 hover:text-white">
                      {selected.size === (data?.ready_for_csv.length ?? 0) ? (
                        <CheckSquare className="size-4 text-emerald-400" />
                      ) : (
                        <Square className="size-4" />
                      )}
                      {selected.size === (data?.ready_for_csv.length ?? 0) ? 'Deselect all' : 'Select all'}
                      {selected.size > 0 && <span className="text-white/30">({selected.size} selected)</span>}
                    </button>
                    {selected.size > 0 && (
                      <button
                        onClick={() => setBatchOpen(true)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center gap-2"
                      >
                        <Download className="size-4" /> Generate Batch CSV ({selected.size})
                      </button>
                    )}
                  </div>
                )}
                {!data?.ready_for_csv.length ? <EmptyState message="No payouts ready for CSV export." /> : (
                  <DataTable>
                    <thead>
                      <tr className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                        <th className="px-4 py-3 text-left w-8" />
                        <th className="px-4 py-3 text-left">Tutor</th>
                        <th className="px-4 py-3 text-left">Student / Session Date</th>
                        <th className="px-4 py-3 text-right">Payout Amount</th>
                        <th className="px-4 py-3 text-left">Bank</th>
                        <th className="px-4 py-3 text-left">Account</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.ready_for_csv.map((row) => {
                        const isSelected = selected.has(row.ledger_id);
                        return (
                          <tr
                            key={row.ledger_id}
                            onClick={() => toggleOne(row.ledger_id)}
                            className={`cursor-pointer transition ${isSelected ? 'bg-emerald-500/8' : 'hover:bg-white/3'}`}
                          >
                            <td className="px-4 py-3">
                              {isSelected
                                ? <CheckSquare className="size-4 text-emerald-400" />
                                : <Square className="size-4 text-white/20" />}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm font-semibold text-white">{row.tutor_name ?? '—'}</p>
                              {row.tutor_email && <p className="text-xs text-white/40">{row.tutor_email}</p>}
                            </td>
                            <td className="px-4 py-3 text-xs text-white/50">
                              {fmtDate(row.scheduled_at)}
                              {row.payment_date && <span className="block text-white/30">Paid {fmtDate(row.payment_date)}</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-emerald-300 tabular-nums font-semibold">{fmtTTD(row.amount_ttd)}</td>
                            <td className="px-4 py-3 text-sm text-white/60">
                              {row.bank_name ?? <span className="text-white/25 italic">No bank</span>}
                              {row.branch && <span className="text-white/35"> · {row.branch}</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-white/50 font-mono">
                              {row.account_number ?? <span className="text-white/25 not-italic font-sans">—</span>}
                              {row.account_type && <span className="ml-1 text-white/30 font-sans">({row.account_type})</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </DataTable>
                )}
              </div>
            )}

            {/* ── BATCH FAILED ── */}
            {tab === 'failed' && (
              !data?.batch_failed.length ? <EmptyState message="No failed or cancelled batches." /> : (
                <DataTable>
                  <thead>
                    <tr className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Batch ID</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Lines</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-left">Generated</th>
                      <th className="px-4 py-3 text-left">Cancelled</th>
                      <th className="px-4 py-3 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.batch_failed.map((row) => (
                      <tr key={row.batch_id} className="hover:bg-white/3">
                        <td className="px-4 py-3 font-mono text-xs text-white/60">{row.batch_id.slice(0, 8)}…</td>
                        <td className="px-4 py-3 text-right text-sm text-white tabular-nums">{fmtTTD(row.total_amount_ttd)}</td>
                        <td className="px-4 py-3 text-right text-sm text-white/60 tabular-nums">{row.line_count}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300">
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-white/40">{fmtDate(row.generated_at)}</td>
                        <td className="px-4 py-3 text-xs text-white/40">{fmtDate(row.cancelled_at)}</td>
                        <td className="px-4 py-3 text-xs text-white/40 max-w-[200px] truncate">{row.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )
            )}

            {/* ── UNOFFICIAL CSV ── */}
            {tab === 'unofficial' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <p className="text-sm text-white/50">
                    Per-tutor payout totals with pending debts deducted. Not yet an official batch.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={loadData}
                      disabled={loading}
                      className="px-3 py-2 rounded-xl border border-white/10 text-white/70 hover:text-white text-sm flex items-center gap-2"
                    >
                      <RefreshCcw className="size-3.5" /> Refresh
                    </button>
                    {(data?.unofficial_csv.length ?? 0) > 0 && (
                      <button
                        onClick={downloadUnofficialCsv}
                        className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold flex items-center gap-2"
                      >
                        <FileSpreadsheet className="size-4" /> Download CSV
                      </button>
                    )}
                  </div>
                </div>

                {!data?.unofficial_csv.length ? (
                  <EmptyState message="No unbatched one-on-one payouts found." />
                ) : (
                  <>
                    {(data.unofficial_totals.total_debt_ttd > 0) && (
                      <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                        <TrendingDown className="size-4 mt-0.5 shrink-0" />
                        <span>
                          <strong className="text-rose-200">
                            TT$ {data.unofficial_totals.total_debt_ttd.toFixed(2)}
                          </strong>{' '}
                          in platform debt is being deducted across{' '}
                          {data.unofficial_csv.filter((t) => t.pending_debt_ttd > 0).length} tutor(s)
                          before CSV totals are calculated.
                        </span>
                      </div>
                    )}

                    <div className="rounded-xl overflow-hidden border border-white/8">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[11px] font-semibold text-white/30 uppercase tracking-wider border-b border-white/8" style={{ background: '#161618' }}>
                            <th className="px-4 py-3 text-left">Tutor</th>
                            <th className="px-4 py-3 text-left">Bank / Account</th>
                            <th className="px-4 py-3 text-right">Gross payout</th>
                            <th className="px-4 py-3 text-right text-rose-400">Platform debt</th>
                            <th className="px-4 py-3 text-right text-emerald-400">Net payout</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {data.unofficial_csv.map((t) => (
                            <tr key={t.tutor_id} className="hover:bg-white/[0.02]" style={{ background: '#0f0f10' }}>
                              <td className="px-4 py-3">
                                <div className="font-semibold text-white">{t.tutor_name ?? '—'}</div>
                                {t.email && <div className="text-xs text-white/40">{t.email}</div>}
                              </td>
                              <td className="px-4 py-3 text-white/60 text-xs">
                                {t.bank_name ?? '—'}{t.branch ? ` · ${t.branch}` : ''}<br />
                                <span className="font-mono">{t.account_number ?? '—'}</span>
                                {t.account_type ? <span className="ml-1 text-white/30">({t.account_type})</span> : null}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-white/70">
                                TT$ {t.gross_payout_ttd.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {t.pending_debt_ttd > 0
                                  ? <span className="text-rose-400">− TT$ {t.pending_debt_ttd.toFixed(2)}</span>
                                  : <span className="text-white/20">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-400">
                                TT$ {t.net_payout_ttd.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t border-white/10">
                          <tr style={{ background: '#161618' }}>
                            <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-white/40 uppercase tracking-wider">Totals</td>
                            <td className="px-4 py-3 text-right tabular-nums text-white/60 font-semibold">
                              TT$ {data.unofficial_totals.total_gross_ttd.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-rose-400 font-semibold">
                              {data.unofficial_totals.total_debt_ttd > 0
                                ? `− TT$ ${data.unofficial_totals.total_debt_ttd.toFixed(2)}`
                                : '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-emerald-400 font-bold">
                              TT$ {data.unofficial_totals.total_net_ttd.toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Refund Modal */}
      {refundTarget && (
        <RefundModal
          row={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSuccess={() => { setRefundTarget(null); loadData(); }}
        />
      )}

      {/* No-show Resolve Modal */}
      {noshowTarget && (
        <NoshowModal
          claim={noshowTarget}
          onClose={() => setNoshowTarget(null)}
          onSuccess={() => { setNoshowTarget(null); loadData(); }}
        />
      )}

      {/* Batch CSV Modal */}
      {batchOpen && data && (
        <BatchModal
          selected={selected}
          allReady={data.ready_for_csv}
          onClose={() => setBatchOpen(false)}
          onSuccess={() => { setBatchOpen(false); loadData(); }}
        />
      )}
    </div>
  );
}
