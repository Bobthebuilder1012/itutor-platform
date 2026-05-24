'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Wallet, ArrowDownToLine, TrendingUp, Search, Banknote, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';

type Tab = 'overview' | 'transactions';

type HistoryStatus = 'in_escrow' | 'awaiting_transfer' | 'paid' | 'reversed' | 'unknown';

interface WalletHistoryRow {
  ledger_id: string;
  session_id: string;
  amount_ttd: number;
  status: HistoryStatus;
  ledger_status: string;
  created_at: string;
  released_at: string | null;
  batch_id: string | null;
  scheduled_start_at: string | null;
  charge_amount_ttd: number | null;
  platform_fee_ttd: number | null;
  student_id: string | null;
  student_name: string | null;
  student_avatar_url: string | null;
  subject_name: string | null;
}

interface WalletPayload {
  balances: {
    pending_ttd: number;
    available_ttd: number;
    lifetime_paid_ttd: number;
    last_updated: string | null;
  };
  history: WalletHistoryRow[];
}

interface StudentBreakdownRow {
  studentId: string;
  name: string;
  avatarUrl: string | null;
  completedCount: number;
  earned: number;
  upcomingCount: number;
  projected: number;
}

interface UpcomingSession {
  studentId: string;
  payout: number;
}

const UPCOMING_STATUSES = ['SCHEDULED', 'JOIN_OPEN'];
// Ledger statuses that represent money the tutor has earned (work done, not refunded).
// Used so per-student "Earned" reconciles with `lifetime_paid_ttd` (+ pending + awaiting).
const EARNED_LEDGER_STATUSES: HistoryStatus[] = ['in_escrow', 'awaiting_transfer', 'paid'];

function fmtTTD(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TutorWalletPage() {
  return (
    <TutorShell>
      <WalletContent />
    </TutorShell>
  );
}

function WalletContent() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<WalletPayload | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState('');
  const [upcoming, setUpcoming] = useState<UpcomingSession[] | null>(null);
  const [upcomingStudents, setUpcomingStudents] = useState<Map<string, { name: string; avatarUrl: string | null }>>(new Map());

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchWallet();
    fetchUpcoming(profile.id);
  }, [profile?.id]);

  async function fetchWallet() {
    setDataLoading(true);
    setError('');
    try {
      const res = await fetch('/api/tutor/wallet');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load wallet');
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDataLoading(false);
    }
  }

  async function fetchUpcoming(tutorId: string) {
    const now = new Date();
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const { data: upcomingSessions } = await supabase
      .from('sessions')
      .select('id, payout_amount_ttd, student_id')
      .eq('tutor_id', tutorId)
      .in('status', UPCOMING_STATUSES)
      .gte('scheduled_start_at', now.toISOString())
      .lt('scheduled_start_at', nextMonthEnd.toISOString());

    const rows: UpcomingSession[] = (upcomingSessions ?? [])
      .filter((s: any) => s.student_id)
      .map((s: any) => ({ studentId: s.student_id, payout: Number(s.payout_amount_ttd ?? 0) }));
    setUpcoming(rows);

    const studentIds = Array.from(new Set(rows.map((r) => r.studentId)));
    if (studentIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, display_name, avatar_url')
        .in('id', studentIds);
      const map = new Map<string, { name: string; avatarUrl: string | null }>();
      (profiles ?? []).forEach((p: any) => {
        map.set(p.id, {
          name: p.display_name || p.full_name || 'Student',
          avatarUrl: p.avatar_url ?? null,
        });
      });
      setUpcomingStudents(map);
    } else {
      setUpcomingStudents(new Map());
    }
  }

  const balances = data?.balances;
  const history = data?.history ?? [];

  // Source of truth: payment ledger (same as `lifetime_paid_ttd`). This guarantees
  // the breakdown's "Earned" total reconciles with the Lifetime Paid card.
  const breakdown = useMemo<StudentBreakdownRow[]>(() => {
    const map = new Map<string, StudentBreakdownRow>();
    const ensure = (studentId: string, name: string | null, avatarUrl: string | null): StudentBreakdownRow => {
      let row = map.get(studentId);
      if (!row) {
        row = {
          studentId,
          name: name || 'Student',
          avatarUrl,
          completedCount: 0,
          earned: 0,
          upcomingCount: 0,
          projected: 0,
        };
        map.set(studentId, row);
      } else if (name && row.name === 'Student') {
        row.name = name;
      }
      if (avatarUrl && !row.avatarUrl) row.avatarUrl = avatarUrl;
      return row;
    };

    for (const h of history) {
      if (!h.student_id) continue;
      if (!EARNED_LEDGER_STATUSES.includes(h.status)) continue;
      const row = ensure(h.student_id, h.student_name, h.student_avatar_url);
      row.completedCount += 1;
      row.earned += h.amount_ttd;
    }

    for (const u of upcoming ?? []) {
      const meta = upcomingStudents.get(u.studentId);
      const row = ensure(u.studentId, meta?.name ?? null, meta?.avatarUrl ?? null);
      row.upcomingCount += 1;
      row.projected += u.payout;
    }

    return Array.from(map.values())
      .filter((r) => r.completedCount > 0 || r.upcomingCount > 0)
      .sort((a, b) => b.earned + b.projected - (a.earned + a.projected));
  }, [history, upcoming, upcomingStudents]);

  const projectedThisMonth = useMemo(
    () => (upcoming ?? []).reduce((sum, u) => sum + u.payout, 0),
    [upcoming]
  );
  const totalCompletedCount = useMemo(
    () => breakdown.reduce((sum, r) => sum + r.completedCount, 0),
    [breakdown]
  );
  const upcomingCount = upcoming?.length ?? 0;
  const summaryLoading = !data || upcoming === null;

  const monthEarned = useMemo(() => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    return history
      .filter((h) => h.status === 'paid' && h.released_at && new Date(h.released_at).getTime() >= monthStart)
      .reduce((s, h) => s + h.amount_ttd, 0);
  }, [history]);

  return (
    <div className="max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">My Wallet</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Earnings tracked from completed sessions. Payouts are sent via bulk bank transfer on the next cycle.
        </p>
      </header>

      {error && (
        <div className="rounded-xl bg-coral/10 border border-coral/30 p-3 text-sm text-coral">{error}</div>
      )}

      <div className="border-b border-border flex items-center gap-6 text-sm">
        {(['overview', 'transactions'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('relative pb-3 font-semibold capitalize transition', tab === t ? 'text-ink' : 'text-muted-foreground hover:text-ink')}>
            {t}
            {tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Hero — awaiting bank transfer is what tutor cares about most */}
          <div className="rounded-3xl bg-gradient-to-br from-ink to-forest p-6 text-white shadow-pop">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60 font-semibold">
              <Banknote className="size-3.5" /> Awaiting bank transfer
            </div>
            <div className="mt-2 text-4xl font-bold tabular-nums">
              TT$ {fmtTTD(balances?.available_ttd ?? 0)}
            </div>
            <div className="mt-1 text-sm text-white/70">
              {(balances?.pending_ttd ?? 0) > 0
                ? `+ TT$ ${fmtTTD(balances?.pending_ttd ?? 0)} still in escrow`
                : 'No earnings still in escrow'}
            </div>
            <div className="mt-3 text-xs text-white/60">
              iTutor pays out via bulk bank transfer on the next payout cycle. Earnings move from escrow to bank-transfer queue 7 days after each session completes.
            </div>
          </div>

          {/* Three-line summary — future money → pending money → received money */}
          <div className="grid sm:grid-cols-3 gap-4">
            <Stat
              label="Projected"
              value={`TT$ ${fmtTTD(projectedThisMonth)}`}
              icon={TrendingUp}
              hint="Based on upcoming sessions"
              valueClass="text-brand-deep"
            />
            <Stat
              label="Awaiting bank transfer"
              value={`TT$ ${fmtTTD(balances?.available_ttd ?? 0)}`}
              icon={ArrowDownToLine}
              hint="Queued for the next payout batch"
            />
            <Stat
              label="Lifetime paid"
              value={`TT$ ${fmtTTD(balances?.lifetime_paid_ttd ?? 0)}`}
              icon={Wallet}
              hint={`This month: TT$ ${fmtTTD(monthEarned)}`}
            />
          </div>

          {/* Bank account status nudge */}
          <div className="rounded-2xl border border-border bg-card p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-brand-soft flex items-center justify-center">
                <Banknote className="size-5 text-brand-deep" />
              </div>
              <div>
                <div className="font-semibold text-ink">Bank account for payouts</div>
                <div className="text-xs text-muted-foreground">Make sure your bank details are up to date so iTutor can pay you on the next cycle.</div>
              </div>
            </div>
            <Link href="/tutor/settings?section=payouts"
              className="px-3 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
              Manage bank details
            </Link>
          </div>

          {/* Student breakdown */}
          <StudentBreakdown
            breakdown={breakdown}
            completedCount={totalCompletedCount}
            upcomingCount={upcomingCount}
            loading={summaryLoading}
          />

          {/* Recent activity */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="font-semibold text-ink">Recent activity</h3>
            <div className="mt-4 space-y-1">
              {dataLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : history.slice(0, 5).length === 0 ? (
                <p className="text-sm text-muted-foreground">No transactions yet.</p>
              ) : (
                history.slice(0, 5).map((row) => <TxRow key={row.ledger_id} row={row} />)
              )}
            </div>
            {history.length > 5 && (
              <button onClick={() => setTab('transactions')}
                className="mt-3 text-sm font-semibold text-brand-deep hover:underline">
                View all transactions →
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'transactions' && (
        <TransactionsTab history={history} loading={dataLoading} />
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, hint, valueClass }: { label: string; value: string; icon: typeof Wallet; hint?: string; valueClass?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <Icon className="size-4 text-brand-deep" />
      </div>
      <div className={cn('mt-2 text-2xl font-bold tabular-nums', valueClass ?? 'text-ink')}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function StudentBreakdown({
  breakdown,
  completedCount,
  upcomingCount,
  loading,
}: {
  breakdown: StudentBreakdownRow[];
  completedCount: number;
  upcomingCount: number;
  loading: boolean;
}) {
  const hasRows = breakdown.length > 0;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-5">
        <div className="size-10 rounded-xl bg-brand-soft flex items-center justify-center">
          <Users className="size-5 text-brand-deep" />
        </div>
        <div>
          <div className="font-semibold text-ink">Student breakdown</div>
          <div className="text-xs text-muted-foreground">
            {loading
              ? 'Loading…'
              : !hasRows
                ? 'No students yet'
                : `${breakdown.length} student${breakdown.length === 1 ? '' : 's'} \u00b7 ${completedCount} completed \u00b7 ${upcomingCount} upcoming this month`}
          </div>
        </div>
      </div>

      {hasRows && (
        <div className="border-t border-border">
          <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-2 bg-muted/30 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            <div className="col-span-4">Student</div>
            <div className="col-span-2 text-right">Completed</div>
            <div className="col-span-2 text-right">Earned</div>
            <div className="col-span-2 text-right">Upcoming</div>
            <div className="col-span-2 text-right">Projected</div>
          </div>
          <ul className="divide-y divide-border">
            {breakdown.map((row) => (
              <li key={row.studentId} className="grid grid-cols-12 gap-3 px-5 py-3 text-sm items-center">
                <div className="col-span-12 sm:col-span-4 flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-full bg-muted grid place-items-center overflow-hidden shrink-0">
                    {row.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.avatarUrl} alt={row.name} className="size-8 object-cover" />
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {row.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="font-medium text-ink truncate">{row.name}</span>
                </div>
                <div className="col-span-3 sm:col-span-2 text-right tabular-nums text-ink">
                  <span className="sm:hidden text-xs text-muted-foreground mr-1">Done</span>
                  {row.completedCount}
                </div>
                <div className="col-span-3 sm:col-span-2 text-right tabular-nums font-semibold text-ink">
                  <span className="sm:hidden text-xs text-muted-foreground mr-1">Earned</span>
                  TT$ {fmtTTD(row.earned)}
                </div>
                <div className="col-span-3 sm:col-span-2 text-right tabular-nums text-ink">
                  <span className="sm:hidden text-xs text-muted-foreground mr-1">Upcoming</span>
                  {row.upcomingCount}
                </div>
                <div className="col-span-3 sm:col-span-2 text-right tabular-nums font-bold text-brand-deep">
                  <span className="sm:hidden text-xs text-muted-foreground mr-1">Proj</span>
                  TT$ {fmtTTD(row.projected)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TransactionsTab({ history, loading }: { history: WalletHistoryRow[]; loading: boolean }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | HistoryStatus>('all');
  const filtered = history.filter((h) =>
    (status === 'all' || h.status === status) &&
    (search === '' ||
      (h.student_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (h.subject_name ?? '').toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by student or subject…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | HistoryStatus)}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
          <option value="all">All statuses</option>
          <option value="in_escrow">In escrow</option>
          <option value="awaiting_transfer">Awaiting bank transfer</option>
          <option value="paid">Paid</option>
          <option value="reversed">Reversed</option>
        </select>
      </div>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No transactions match your filters.</div>
        ) : (
          filtered.map((row) => <TxRow key={row.ledger_id} row={row} detailed />)
        )}
      </div>
    </div>
  );
}

function TxRow({ row, detailed }: { row: WalletHistoryRow; detailed?: boolean }) {
  const date = row.scheduled_start_at ?? row.created_at;
  const dateLabel = new Date(date).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  return (
    <div className={cn('flex items-center gap-3', detailed ? 'p-4' : 'py-2')}>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ink truncate text-sm">
          {row.subject_name ?? 'Session'}{row.student_name ? ` · ${row.student_name}` : ''}
        </div>
        <div className="text-xs text-muted-foreground">
          {dateLabel}
          {row.batch_id && row.status === 'paid' && row.released_at
            ? ` · paid ${new Date(row.released_at).toLocaleDateString()} (batch ${row.batch_id.slice(0, 8)})`
            : ''}
        </div>
      </div>
      {detailed && (
        <div className="hidden sm:block text-right text-xs text-muted-foreground">
          {row.charge_amount_ttd != null && <div>Gross TT$ {fmtTTD(row.charge_amount_ttd)}</div>}
          {row.platform_fee_ttd != null && <div>Fee -TT$ {fmtTTD(row.platform_fee_ttd)}</div>}
        </div>
      )}
      <div className="text-right">
        <div className="font-bold text-ink tabular-nums">TT$ {fmtTTD(row.amount_ttd)}</div>
        <StatusPill status={row.status} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: HistoryStatus }) {
  const config: Record<HistoryStatus, { label: string; cls: string }> = {
    in_escrow:         { label: 'In escrow',          cls: 'bg-peach/50 text-ink' },
    awaiting_transfer: { label: 'Awaiting transfer',  cls: 'bg-amber-100 text-amber-800' },
    paid:              { label: 'Paid',               cls: 'bg-brand-soft text-brand-deep' },
    reversed:          { label: 'Reversed',           cls: 'bg-coral-soft text-coral' },
    unknown:           { label: '—',                  cls: 'bg-zinc-100 text-zinc-600' },
  };
  const { label, cls } = config[status];
  return <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', cls)}>{label}</span>;
}
