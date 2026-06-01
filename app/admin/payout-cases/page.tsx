'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import {
  AlertCircle, ChevronDown, ChevronUp, Clock, ShieldAlert,
  CheckCircle, XCircle, RefreshCw, Loader2, Users, User,
  CalendarDays, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type CaseStatus =
  | 'open' | 'under_review'
  | 'resolved_release_to_tutor' | 'resolved_refund_student'
  | 'resolved_partial_refund' | 'dismissed' | 'closed';

interface PayoutCase {
  id: string;
  hold_reason: string;
  status: CaseStatus;
  group_id: string | null;
  refund_amount_ttd: number | null;
  release_amount_ttd: number | null;
  admin_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  payout_ledger: { amount_ttd: number; status: string; blocked_at: string | null } | null;
  tutor: { id: string; full_name: string; email: string } | null;
  student: { id: string; full_name: string } | null;
  claimant: { id: string; full_name: string } | null;
  session: { id: string; scheduled_start_at: string } | null;
  noshow_claim: { id: string; status: string; admin_verdict: string | null } | null;
  group: { id: string; name: string } | null;
}

interface CaseEvent {
  id: string;
  event_type: string;
  actor_role: string | null;
  before_status: string | null;
  after_status: string | null;
  amount_ttd: number | null;
  notes: string | null;
  created_at: string;
  actor: { full_name: string } | null;
}

const HOLD_REASON_LABELS: Record<string, string> = {
  student_reported_tutor_no_show: 'No-show claim (student)',
  refund_requested:               'Refund request',
  chargeback:                     'Chargeback',
  session_cancelled:              'Session cancelled',
  tutor_cancelled:                'Tutor cancelled',
  class_access_issue:             'Class access issue',
  subscription_dispute:           'Subscription dispute',
  manual_admin_hold:              'Manual admin hold',
  system_inconsistency:           'System inconsistency',
  student_removed_from_group:     'Student removed from group',
  group_subscription_dispute:     'Group subscription dispute',
  tutor_no_show:                  'Tutor no-show (verdict)',
  student_no_show:                'Student no-show (verdict)',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  case_opened:        'Case opened',
  hold_placed:        'Hold placed',
  released_to_tutor:  'Released to tutor',
  refunded_to_student:'Refunded to student',
  partial_split:      'Partial split',
  ledger_reversed:    'Ledger reversed',
  case_closed:        'Case closed',
  case_dismissed:     'Case dismissed',
  note_added:         'Note added',
  status_changed:     'Status changed',
};

const STATUS_CONFIG: Record<CaseStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  open:                        { label: 'Open',            cls: 'bg-amber-100 text-amber-800',     icon: <Clock className="size-3" /> },
  under_review:                { label: 'Under Review',    cls: 'bg-blue-100 text-blue-800',       icon: <ShieldAlert className="size-3" /> },
  resolved_release_to_tutor:   { label: 'Released',        cls: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle className="size-3" /> },
  resolved_refund_student:     { label: 'Refunded',        cls: 'bg-rose-100 text-rose-800',       icon: <XCircle className="size-3" /> },
  resolved_partial_refund:     { label: 'Partial refund',  cls: 'bg-purple-100 text-purple-800',   icon: <RefreshCw className="size-3" /> },
  dismissed:                   { label: 'Dismissed',       cls: 'bg-zinc-100 text-zinc-600',       icon: <XCircle className="size-3" /> },
  closed:                      { label: 'Closed',          cls: 'bg-zinc-100 text-zinc-600',       icon: <CheckCircle className="size-3" /> },
};

function fmtTTD(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return `TT$ ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-TT', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-TT', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const STATUS_FILTERS = [
  { value: 'open,under_review',         label: 'Active (open + under review)' },
  { value: 'open',                      label: 'Open only' },
  { value: 'under_review',              label: 'Under review only' },
  { value: 'resolved_release_to_tutor', label: 'Released to tutor' },
  { value: 'resolved_refund_student',   label: 'Refunded to student' },
  { value: 'resolved_partial_refund',   label: 'Partial refund' },
  { value: 'dismissed',                 label: 'Dismissed' },
  { value: 'closed',                    label: 'Closed' },
  { value: 'all',                       label: 'All cases' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPayoutCasesPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [cases, setCases] = useState<PayoutCase[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('open,under_review');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

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

  const loadCases = useCallback(async () => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (statusFilter !== 'all') {
      statusFilter.split(',').forEach((s) => params.append('status', s));
    }
    try {
      const res = await fetch(`/api/admin/payout-cases?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load cases');
      setCases(json.cases ?? []);
      setTotal(json.total ?? 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    if (!authLoading) loadCases();
  }, [authLoading, loadCases]);

  if (authLoading) {
    return (
      <DashboardLayout role="admin" userName="Admin">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const activeCount = cases.filter((c) => c.status === 'open' || c.status === 'under_review').length;

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="max-w-6xl mx-auto space-y-6 p-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payout Holdings</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Held payouts awaiting admin decision.
              {total > 0 && ` ${total} case${total === 1 ? '' : 's'} shown.`}
            </p>
          </div>
          {activeCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-sm font-semibold">
              <AlertCircle className="size-4" /> {activeCount} need{activeCount === 1 ? 's' : ''} action
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <button
            onClick={loadCases}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm hover:bg-gray-50 flex items-center gap-1.5"
          >
            <RefreshCw className="size-3.5" /> Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Cases list */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm">Loading cases…</span>
          </div>
        ) : cases.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
            <CheckCircle className="size-10 mx-auto text-gray-300" />
            <p className="mt-3 text-sm font-semibold text-gray-700">No cases found</p>
            <p className="mt-1 text-xs text-gray-500">No payout holds match the current filter.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden bg-white shadow-sm">
            {cases.map((c) => (
              <CaseRow key={c.id} payoutCase={c} onResolved={loadCases} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Page {page} of {totalPages} ({total} cases)</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// ─── Case Row ─────────────────────────────────────────────────────────────────

function CaseRow({ payoutCase: c, onResolved }: { payoutCase: PayoutCase; onResolved: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [markingReview, setMarkingReview] = useState(false);

  const isActive = c.status === 'open' || c.status === 'under_review';
  const sc = STATUS_CONFIG[c.status] ?? { label: c.status, cls: 'bg-zinc-100 text-zinc-600', icon: null };

  async function loadEvents() {
    if (events.length > 0) return;
    setEventsLoading(true);
    try {
      const { data } = await supabase
        .from('payout_case_events')
        .select('id, event_type, actor_role, before_status, after_status, amount_ttd, notes, created_at, actor:profiles!actor_id(full_name)')
        .eq('case_id', c.id)
        .order('created_at', { ascending: true });
      setEvents((data as any) ?? []);
    } finally {
      setEventsLoading(false);
    }
  }

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next) loadEvents();
  }

  async function markUnderReview() {
    setMarkingReview(true);
    try {
      await supabase
        .from('payout_cases')
        .update({ status: 'under_review', updated_at: new Date().toISOString() })
        .eq('id', c.id);
      onResolved();
    } finally {
      setMarkingReview(false);
    }
  }

  const contextParts: string[] = [];
  if (c.group?.name)          contextParts.push(c.group.name);
  if (c.student?.full_name)   contextParts.push(`Student: ${c.student.full_name}`);
  else if (c.claimant?.full_name) contextParts.push(`Claimant: ${c.claimant.full_name}`);
  if (c.session)              contextParts.push(`Session ${fmtDate(c.session.scheduled_start_at)}`);

  return (
    <div>
      <button
        onClick={handleExpand}
        className={cn(
          'w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition',
          isActive && 'bg-amber-50/30',
        )}
      >
        {/* Status */}
        <span className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider shrink-0 mt-0.5',
          sc.cls,
        )}>
          {sc.icon} {sc.label}
        </span>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">
            {c.tutor?.full_name ?? 'Unknown tutor'}
            {c.tutor?.email && (
              <span className="ml-1.5 text-gray-400 font-normal text-xs">{c.tutor.email}</span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium text-gray-700">
              {HOLD_REASON_LABELS[c.hold_reason] ?? c.hold_reason}
            </span>
            {contextParts.length > 0 && (
              <span className="text-gray-400">{contextParts.join(' · ')}</span>
            )}
          </div>
        </div>

        {/* Amount + date */}
        <div className="text-right shrink-0">
          <div className="font-bold text-gray-900 tabular-nums text-sm">
            {fmtTTD(c.payout_ledger?.amount_ttd ?? null)}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{fmtDate(c.created_at)}</div>
        </div>

        {expanded
          ? <ChevronUp className="size-4 text-gray-400 shrink-0 mt-1" />
          : <ChevronDown className="size-4 text-gray-400 shrink-0 mt-1" />
        }
      </button>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-5 space-y-5">

          {/* Detail grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <DetailCell label="Case ID"       value={c.id.slice(0, 8) + '…'} />
            <DetailCell label="Hold reason"   value={HOLD_REASON_LABELS[c.hold_reason] ?? c.hold_reason} />
            <DetailCell label="Ledger status" value={c.payout_ledger?.status ?? 'No ledger yet'} />
            <DetailCell label="Held amount"   value={fmtTTD(c.payout_ledger?.amount_ttd ?? null)} />
            <DetailCell label="Tutor"         value={c.tutor?.full_name ?? '—'} />
            <DetailCell label="Student"       value={c.student?.full_name ?? c.claimant?.full_name ?? '—'} />
            <DetailCell label="Group"         value={c.group?.name ?? '—'} />
            <DetailCell label="Blocked at"    value={fmtDate(c.payout_ledger?.blocked_at)} />
            {c.session && (
              <DetailCell label="Session date" value={fmtDate(c.session.scheduled_start_at)} />
            )}
            {c.resolved_at && (
              <DetailCell label="Resolved at" value={fmtDateTime(c.resolved_at)} />
            )}
            {c.refund_amount_ttd != null && (
              <DetailCell label="Refund amount" value={fmtTTD(c.refund_amount_ttd)} />
            )}
            {c.release_amount_ttd != null && (
              <DetailCell label="Release amount" value={fmtTTD(c.release_amount_ttd)} />
            )}
          </div>

          {/* No-show verdict banner */}
          {c.noshow_claim && (
            <div className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle className="size-3.5 text-amber-600 shrink-0" />
              <span>
                No-show claim: status <strong>{c.noshow_claim.status}</strong>
                {c.noshow_claim.admin_verdict && (
                  <>, verdict <strong>{c.noshow_claim.admin_verdict}</strong></>
                )}
              </span>
            </div>
          )}

          {/* Admin notes */}
          {c.admin_notes && (
            <div className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2">
              <span className="font-semibold">Notes:</span> {c.admin_notes}
            </div>
          )}

          {/* Mark under review */}
          {c.status === 'open' && (
            <div className="flex items-center gap-2">
              <button
                onClick={markUnderReview}
                disabled={markingReview}
                className="px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1.5"
              >
                {markingReview ? <Loader2 className="size-3 animate-spin" /> : <ShieldAlert className="size-3" />}
                Mark as Under Review
              </button>
            </div>
          )}

          {/* Resolve form */}
          {isActive && (
            <ResolveForm
              caseId={c.id}
              heldAmount={c.payout_ledger?.amount_ttd ?? null}
              onResolved={onResolved}
            />
          )}

          {/* Timeline */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Clock className="size-3.5" /> Timeline
            </div>
            {eventsLoading ? (
              <div className="text-xs text-gray-400 flex items-center gap-1.5 py-2">
                <Loader2 className="size-3 animate-spin" /> Loading events…
              </div>
            ) : events.length === 0 ? (
              <div className="text-xs text-gray-400 py-2 italic">No audit events recorded yet.</div>
            ) : (
              <ol className="relative border-l border-gray-200 ml-2 space-y-3">
                {events.map((ev) => (
                  <li key={ev.id} className="pl-4">
                    <span className="absolute -left-1 top-1 size-2 rounded-full bg-gray-400" />
                    <div className="text-xs font-semibold text-gray-700">
                      {EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}
                      {ev.before_status && ev.after_status && (
                        <span className="ml-1.5 font-normal text-gray-500">
                          <ArrowRight className="size-2.5 inline" /> {ev.after_status}
                        </span>
                      )}
                      {ev.amount_ttd != null && (
                        <span className="ml-2 text-gray-500">{fmtTTD(ev.amount_ttd)}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {fmtDateTime(ev.created_at)}
                      {ev.actor?.full_name && ` · by ${ev.actor.full_name}`}
                      {ev.actor_role && !ev.actor?.full_name && ` · ${ev.actor_role}`}
                    </div>
                    {ev.notes && (
                      <div className="text-[11px] text-gray-500 mt-0.5 italic">{ev.notes}</div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{label}</div>
      <div className="mt-0.5 font-medium text-gray-800 truncate text-xs">{value}</div>
    </div>
  );
}

// ─── Resolve Form ─────────────────────────────────────────────────────────────

function ResolveForm({
  caseId,
  heldAmount,
  onResolved,
}: {
  caseId: string;
  heldAmount: number | null;
  onResolved: () => void;
}) {
  const [action, setAction] = useState<'release_to_tutor' | 'refund_student' | 'partial_refund'>('release_to_tutor');
  const [refundAmt, setRefundAmt]   = useState('');
  const [releaseAmt, setReleaseAmt] = useState('');
  const [notes, setNotes]           = useState('');
  const [working, setWorking]       = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');

  async function resolve() {
    setError(''); setSuccess(''); setWorking(true);
    try {
      const body: Record<string, unknown> = { action, admin_notes: notes || undefined };
      if (action === 'partial_refund') {
        body.refund_amount_ttd  = parseFloat(refundAmt);
        body.release_amount_ttd = parseFloat(releaseAmt);
      }
      const res = await fetch(`/api/admin/payout-cases/${caseId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok && !json.warning) throw new Error(json.error || 'Failed to resolve');

      if (json.warning) {
        setSuccess(`Refund issued but DB sync pending. Retry to close the case. (${json.warning})`);
      } else {
        setSuccess('Case resolved successfully.');
        setTimeout(() => onResolved(), 800);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }

  const actionOptions = [
    { val: 'release_to_tutor' as const, label: 'Release to tutor',  activeCls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    { val: 'refund_student'   as const, label: 'Refund student',    activeCls: 'bg-rose-100 text-rose-800 border-rose-300' },
    { val: 'partial_refund'   as const, label: 'Partial split',     activeCls: 'bg-purple-100 text-purple-800 border-purple-300' },
  ] as const;

  const actionDesc = {
    release_to_tutor: "The held payout is restored to the tutor's pending balance. No refund to student.",
    refund_student:   `The full held amount (${fmtTTD(heldAmount)}) will be refunded via LuniPay. Payout reversed.`,
    partial_refund:   'Specify how much goes to the student (refund) and how much to the tutor (release). Validated independently.',
  };

  const confirmLabel = {
    release_to_tutor: 'Release to Tutor',
    refund_student:   'Refund Student',
    partial_refund:   'Partial Split',
  };

  const confirmCls = {
    release_to_tutor: 'bg-emerald-600 hover:bg-emerald-700',
    refund_student:   'bg-rose-600 hover:bg-rose-700',
    partial_refund:   'bg-purple-600 hover:bg-purple-700',
  };

  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4 space-y-3">
      <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
        Resolve this case
      </div>

      <div className="flex flex-wrap gap-2">
        {actionOptions.map(({ val, label, activeCls }) => (
          <button
            key={val}
            onClick={() => setAction(val)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition',
              action === val ? activeCls : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-500">{actionDesc[action]}</p>

      {action === 'partial_refund' && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Refund to student (TTD)
            </label>
            <input
              type="number" min="0" step="0.01"
              value={refundAmt}
              onChange={(e) => setRefundAmt(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Release to tutor (TTD)
            </label>
            <input
              type="number" min="0" step="0.01"
              value={releaseAmt}
              onChange={(e) => setReleaseAmt(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Admin notes (optional)
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Reason for this decision…"
          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error   && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
      {success && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{success}</div>}

      <div className="flex items-center justify-between pt-1">
        <div className="text-xs text-gray-400">
          Held: <strong>{fmtTTD(heldAmount)}</strong>
        </div>
        <button
          onClick={resolve}
          disabled={working || (action === 'partial_refund' && (!refundAmt || !releaseAmt))}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50 flex items-center gap-1.5',
            confirmCls[action],
          )}
        >
          {working
            ? <Loader2 className="size-4 animate-spin" />
            : `Confirm — ${confirmLabel[action]}`
          }
        </button>
      </div>
    </div>
  );
}
