'use client';
// Group Tracker: financial overview per group class — earned, projected, pending, awaiting payout
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Wallet, TrendingUp, Search, Banknote, Users, AlertCircle,
  ArrowDownToLine, Receipt, CheckCircle2, Clock, XCircle, Loader2,
  ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';

type Tab = 'overview' | 'transactions' | 'group-tracker' | 'payouts' | 'statements';

type HistoryStatus = 'in_escrow' | 'awaiting_transfer' | 'paid' | 'reversed' | 'under_review' | 'unknown';

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
  source_type?: 'session' | 'subscription';
}

interface PendingDeduction {
  id: string;
  amount_ttd: number;
  reason: string;
  status: string;
  created_at: string;
  source_enrollment_id: string | null;
  source_subscription_payment_id: string | null;
}

interface WalletPayload {
  balances: {
    pending_ttd: number;
    available_ttd: number;
    lifetime_paid_ttd: number;
    held_ttd: number;
    upcoming_ttd: number;
    pending_deductions_ttd: number;
    last_updated: string | null;
  };
  pending_deductions: PendingDeduction[];
  history: WalletHistoryRow[];
}

interface StudentBreakdownRow {
  studentId: string;
  name: string;
  avatarUrl: string | null;
  totalPaid: number;
  groupsCount: number;
  oneOnOneCount: number;
  upcomingCount: number;
  projectedUpcoming: number;
}

interface UpcomingSession {
  studentId: string;
  payout: number;
}

interface GroupSubscriber {
  enrollment_id: string;
  student_id: string;
  student_name: string | null;
  student_avatar_url: string | null;
  status: string;
  payment_status: string;
  plan_price_ttd: number | null;
  last_paid_at: string | null;
  current_period_end: string | null;
  next_payment_due_at: string | null;
  cancel_at_period_end: boolean;
  paid_this_month: boolean;
  paid_periods: { month: number; year: number }[];
}

interface GroupTrackerGroup {
  id: string;
  name: string;
  subject_name: string | null;
  max_students: number | null;
  price_monthly: number | null;
  status: string;
  active_count: number;
  pending_count: number;
  paid_this_month_count: number;
  total_earned_ttd: number;
  earned_this_month_ttd: number;
  projected_this_month_ttd: number;
  waiting_for_payout_ttd: number;
  subscribers: GroupSubscriber[];
}

const UPCOMING_STATUSES = ['SCHEDULED', 'JOIN_OPEN'];
const EARNED_LEDGER_STATUSES: HistoryStatus[] = ['in_escrow', 'awaiting_transfer', 'paid'];

function fmtTTD(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TT_BANKS: Record<string, { swift: string; code: string; branches: string[] }> = {
  'Republic Bank': {
    swift: 'RBNKTTPX', code: '004',
    branches: [
      'Ellerslie Court – Maraval', 'Glencoe', 'Long Circular Mall – St. James',
      'Starlite – Diego Martin', 'West Mall – Westmoorings', 'Hilton Agency – POS',
      'Independence Square – POS', 'Park Street – POS', 'Tragarete Road – POS', 'Woodbrook',
      'Grand Bazaar – Valsayn', 'Shops of Arima Agency', 'Arima – Broadway',
      'Trincity', 'Valpark – Valsayn', 'Chaguanas – Centre City', 'Couva',
      'Sangre Grande', 'San Juan', 'St. Augustine', 'Tunapuna',
      'Gulf View – La Romaine', 'South Park – Tarouba', 'Atlantic Plaza Agency – Point Lisas',
      'Cipero Street – San Fernando', 'Fyzabad', 'Harris Promenade – San Fernando',
      'High Street – San Fernando', 'Marabella', 'Mayaro', 'Penal',
      'Princes Town', 'Point Fortin', 'Rio Claro', 'Siparia',
    ],
  },
  'First Citizens Bank': {
    swift: 'FCBLTTPS', code: '006',
    branches: [
      'Arima', 'Sangre Grande', 'Tunapuna',
      'MovieTowne Financial Centre – Invaders Bay',
      'Port of Spain – Independence Square', 'Port of Spain – Maraval',
      'One Woodbrook Place – Tragarete Rd', 'Park Street – POS',
      'West Vale Mall – Diego Martin', 'San Juan',
      'Chaguanas – Market Street', 'Montrose',
      'Couva', 'Gulf View Mall – La Romaine', 'Marabella', 'Penal',
      'Point Fortin', 'Point Lisas', 'Princes Town', 'San Fernando', 'Siparia',
      'Milford Road – Tobago', 'Scarborough – Tobago', 'Roxborough – Tobago',
    ],
  },
  'RBC Royal Bank': {
    swift: 'ROYCTTPS', code: '007',
    branches: [
      'Arima', 'Chaguanas – Royal Plaza', 'Chaguaramas', 'Couva',
      'Diego Martin – Starlite', 'Guayaguayare', 'La Romaine – Gulf City',
      'Maraval', 'Point Fortin', 'Point Lisas', 'Pointe-a-Pierre',
      'Port of Spain – Independence Square', 'Port of Spain – Park Street',
      'Princes Town', 'San Fernando – Carlton Centre', 'San Fernando – High Street',
      'San Juan', 'Sangre Grande', 'Siparia', 'St. Augustine',
      'St. James', 'Trincity', 'Westmoorings',
    ],
  },
  'Scotiabank': {
    swift: 'NOSCTTPS', code: '003',
    branches: [
      'Diego Martin', 'Maraval', 'Independence Square – POS', 'Scotia Centre – Park & Richmond',
      'Sangre Grande', 'Trincity', 'Tunapuna', 'Arima',
      'Couva', 'Price Plaza – Chaguanas', 'Chaguanas',
      'Marabella', 'Princes Town', 'San Fernando', 'Penal',
    ],
  },
  'ANSA Bank': {
    swift: 'ANBATTPS', code: '015',
    branches: [
      'Head Office – Maraval Road, POS', 'Westmoorings – The Falls',
      'San Fernando / La Romaine – Gulf City', 'Chaguanas – Endeavour Road',
    ],
  },
  'ANSA Merchant Bank': {
    swift: 'ANFMTTP1', code: '016',
    branches: ['Port of Spain – Head Office'],
  },
  'CIBC Caribbean Bank': {
    swift: 'CIBLTTPS', code: '019',
    branches: [
      'Maraval Finance Centre', 'Chaguanas Finance Centre',
      'Corporate & Investment Banking Centre – Chaguanas',
    ],
  },
  'Citibank': {
    swift: 'CITITTPS', code: '009',
    branches: ["Port of Spain – Queen's Park East"],
  },
  'JMMB Bank': {
    swift: 'JMMBTTPS', code: '020',
    branches: [
      'San Fernando – SouthPark', 'Woodbrook / Port of Spain',
      'Tunapuna', 'Chaguanas – DSM Plaza', 'Princes Town Mall',
    ],
  },
  'Agricultural Development Bank': {
    swift: 'ADEVTTP1', code: '017',
    branches: ['Port of Spain – Head Office', 'Couva', 'Sangre Grande', 'San Fernando', 'Scarborough – Tobago'],
  },
};

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
      .select('id, payout_amount_ttd, student_id, scheduled_start_at')
      .eq('tutor_id', tutorId)
      .in('status', UPCOMING_STATUSES)
      .gt('scheduled_end_at', now.toISOString())
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
        map.set(p.id, { name: p.display_name || p.full_name || 'Student', avatarUrl: p.avatar_url ?? null });
      });
      setUpcomingStudents(map);
    } else {
      setUpcomingStudents(new Map());
    }
  }

  const balances = data?.balances;
  const history = data?.history ?? [];

  const breakdown = useMemo<StudentBreakdownRow[]>(() => {
    const map = new Map<string, StudentBreakdownRow>();
    // Tracks distinct subscription group names per student to compute groupsCount
    const groupNamesByStudent = new Map<string, Set<string>>();

    const ensure = (studentId: string, name: string | null, avatarUrl: string | null): StudentBreakdownRow => {
      let row = map.get(studentId);
      if (!row) {
        row = { studentId, name: name || 'Student', avatarUrl, totalPaid: 0, groupsCount: 0, oneOnOneCount: 0, upcomingCount: 0, projectedUpcoming: 0 };
        map.set(studentId, row);
      } else {
        if (name && row.name === 'Student') row.name = name;
        if (avatarUrl && !row.avatarUrl) row.avatarUrl = avatarUrl;
      }
      return row;
    };

    for (const h of history) {
      if (!h.student_id) continue;
      if (!EARNED_LEDGER_STATUSES.includes(h.status)) continue;
      const row = ensure(h.student_id, h.student_name, h.student_avatar_url);
      row.totalPaid += h.amount_ttd;
      if (h.source_type === 'subscription') {
        const key = h.subject_name ?? '__group__';
        if (!groupNamesByStudent.has(h.student_id)) groupNamesByStudent.set(h.student_id, new Set());
        groupNamesByStudent.get(h.student_id)!.add(key);
      } else {
        row.oneOnOneCount += 1;
      }
    }

    // Derive groupsCount from collected distinct group names
    for (const [studentId, groupSet] of groupNamesByStudent) {
      const row = map.get(studentId);
      if (row) row.groupsCount = groupSet.size;
    }

    for (const u of upcoming ?? []) {
      const meta = upcomingStudents.get(u.studentId);
      const row = ensure(u.studentId, meta?.name ?? null, meta?.avatarUrl ?? null);
      row.upcomingCount += 1;
      row.projectedUpcoming += u.payout;
    }

    return Array.from(map.values())
      .filter((r) => r.totalPaid > 0 || r.upcomingCount > 0)
      .sort((a, b) => b.totalPaid + b.projectedUpcoming - (a.totalPaid + a.projectedUpcoming));
  }, [history, upcoming, upcomingStudents]);

  const monthEarned = useMemo(() => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    return history
      .filter((h) => h.status === 'paid' && h.released_at && new Date(h.released_at).getTime() >= monthStart)
      .reduce((s, h) => s + h.amount_ttd, 0);
  }, [history]);

  const completedThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    return history
      .filter((h) => {
        if (!EARNED_LEDGER_STATUSES.includes(h.status)) return false;
        const t = new Date(h.scheduled_start_at ?? h.created_at).getTime();
        return t >= monthStart && t < monthEnd;
      })
      .reduce((s, h) => s + h.amount_ttd, 0);
  }, [history]);

  const tentativeThisMonth = useMemo(
    () => (upcoming ?? []).reduce((sum, u) => sum + u.payout, 0),
    [upcoming],
  );

  // Floor: projected can never be less than confirmed ledger balances.
  const projectedThisMonth = useMemo(
    () => Math.max(
      (balances?.pending_ttd ?? 0) + (balances?.available_ttd ?? 0),
      completedThisMonth + tentativeThisMonth,
    ),
    [balances, completedThisMonth, tentativeThisMonth],
  );

  const totalOneOnOneCount = useMemo(
    () => breakdown.reduce((sum, r) => sum + r.oneOnOneCount, 0),
    [breakdown],
  );
  const upcomingCount = upcoming?.length ?? 0;
  const summaryLoading = !data || upcoming === null;

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

      <div className="border-b border-border flex items-center gap-6 text-sm overflow-x-auto">
        {(['overview', 'transactions', 'group-tracker', 'payouts', 'statements'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('relative pb-3 font-semibold capitalize whitespace-nowrap transition', tab === t ? 'text-ink' : 'text-muted-foreground hover:text-ink')}>
            {t.replace('-', ' ')}
            {tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-gradient-to-br from-ink to-forest p-6 text-white shadow-pop">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60 font-semibold">
              <Banknote className="size-3.5" /> Awaiting bank transfer
            </div>
            <div className="mt-2 text-4xl font-bold tabular-nums">
              TT$ {fmtTTD((balances?.available_ttd ?? 0) + (balances?.pending_ttd ?? 0))}
            </div>
            <div className="mt-1 text-sm text-white/70">
              {(balances?.available_ttd ?? 0) > 0 && (balances?.pending_ttd ?? 0) > 0
                ? `TT$ ${fmtTTD(balances?.available_ttd ?? 0)} ready · TT$ ${fmtTTD(balances?.pending_ttd ?? 0)} in escrow`
                : (balances?.available_ttd ?? 0) > 0
                  ? 'Ready for next transfer cycle'
                  : (balances?.pending_ttd ?? 0) > 0
                    ? `TT$ ${fmtTTD(balances?.pending_ttd ?? 0)} in escrow — releases after 7 days`
                    : 'No pending earnings'}
            </div>
            {(balances?.held_ttd ?? 0) > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-500/20 px-3 py-2 text-sm">
                <AlertCircle className="size-4 text-amber-300 shrink-0" />
                <span className="text-amber-200">
                  TT$ {fmtTTD(balances?.held_ttd ?? 0)} under review — awaiting admin decision
                </span>
              </div>
            )}
            {(balances?.upcoming_ttd ?? 0) > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-sky-500/20 px-3 py-2 text-sm">
                <Clock className="size-4 text-sky-300 shrink-0" />
                <span className="text-sky-200">
                  TT$ {fmtTTD(balances?.upcoming_ttd ?? 0)} upcoming — held until your scheduled sessions are confirmed
                </span>
              </div>
            )}
            {(balances?.pending_deductions_ttd ?? 0) > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-500/20 px-3 py-2 text-sm">
                <AlertCircle className="size-4 text-red-300 shrink-0" />
                <span className="text-red-200">
                  TT$ {fmtTTD(balances?.pending_deductions_ttd ?? 0)} owed to platform — will be recovered from your next payout
                </span>
              </div>
            )}
            <div className="mt-3 text-xs text-white/60">
              iTutor pays out via bulk bank transfer on the next payout cycle. Earnings move from escrow to bank-transfer queue 7 days after each session completes.
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <Stat
              label="Projected"
              value={`TT$ ${fmtTTD(projectedThisMonth)}`}
              icon={TrendingUp}
              hint="All earnings this month (sessions + subscriptions)"
              valueClass="text-brand-deep"
            />
            <Stat
              label="Tentative"
              value={`TT$ ${fmtTTD(tentativeThisMonth)}`}
              icon={AlertCircle}
              hint="Upcoming sessions this month. Could still cancel."
              valueClass="text-amber-600"
            />
            <Stat
              label="Lifetime paid"
              value={`TT$ ${fmtTTD(balances?.lifetime_paid_ttd ?? 0)}`}
              icon={Wallet}
              hint={`This month: TT$ ${fmtTTD(monthEarned)}`}
            />
          </div>

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
            <button
              onClick={() => setTab('payouts')}
              className="px-3 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
              Manage bank details
            </button>
          </div>

          {(data?.pending_deductions ?? []).length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-5 text-red-500 shrink-0" />
                <div>
                  <div className="font-semibold text-red-800">Platform debt — TT$ {fmtTTD(balances?.pending_deductions_ttd ?? 0)} owed</div>
                  <div className="text-xs text-red-600 mt-0.5">These amounts will be automatically deducted from your next payout batch.</div>
                </div>
              </div>
              <div className="space-y-2">
                {(data?.pending_deductions ?? []).map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-sm bg-white rounded-xl px-4 py-2.5 border border-red-100">
                    <div>
                      <div className="font-medium text-red-800">
                        {d.reason === 'student_removal_refund' ? 'Student removal refund' : d.reason === 'chargeback' ? 'Chargeback' : 'Admin deduction'}
                      </div>
                      <div className="text-xs text-red-500 mt-0.5">{new Date(d.created_at).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    </div>
                    <div className="font-bold text-red-700">− TT$ {fmtTTD(d.amount_ttd)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <StudentBreakdown
            breakdown={breakdown}
            oneOnOneCount={totalOneOnOneCount}
            upcomingCount={upcomingCount}
            loading={summaryLoading}
          />

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

      {tab === 'group-tracker' && (
        <GroupTrackerTab tutorId={profile?.id ?? ''} />
      )}

      {tab === 'payouts' && (
        <PayoutsTab />
      )}

      {tab === 'statements' && (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Receipt className="size-8 mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-ink">Monthly statements coming soon</p>
          <p className="mt-1 text-xs text-muted-foreground">Downloadable PDF statements will be available here once you have completed sessions.</p>
        </div>
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
  breakdown, oneOnOneCount, upcomingCount, loading,
}: {
  breakdown: StudentBreakdownRow[];
  oneOnOneCount: number;
  upcomingCount: number;
  loading: boolean;
}) {
  const hasRows = breakdown.length > 0;
  const totalGroups = breakdown.reduce((s, r) => s + r.groupsCount, 0);

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
                : `${breakdown.length} student${breakdown.length === 1 ? '' : 's'} · ${oneOnOneCount} 1:1 sessions · ${totalGroups} group subscription${totalGroups === 1 ? '' : 's'} · ${upcomingCount} upcoming`}
          </div>
        </div>
      </div>

      {hasRows && (
        <div className="border-t border-border">
          <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-2 bg-muted/30 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            <div className="col-span-4">Student</div>
            <div className="col-span-2 text-right">Total paid</div>
            <div className="col-span-2 text-right">Groups</div>
            <div className="col-span-2 text-right">1:1 done</div>
            <div className="col-span-2 text-right">Upcoming</div>
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
                <div className="col-span-6 sm:col-span-2 text-right tabular-nums font-semibold text-ink">
                  <span className="sm:hidden text-xs text-muted-foreground mr-1">Paid</span>
                  TT$ {fmtTTD(row.totalPaid)}
                </div>
                <div className="col-span-2 sm:col-span-2 text-right tabular-nums text-ink">
                  <span className="sm:hidden text-xs text-muted-foreground mr-1">Groups</span>
                  {row.groupsCount > 0 ? (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 text-[11px] font-semibold">{row.groupsCount}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="col-span-2 sm:col-span-2 text-right tabular-nums text-ink">
                  <span className="sm:hidden text-xs text-muted-foreground mr-1">1:1</span>
                  {row.oneOnOneCount > 0 ? row.oneOnOneCount : <span className="text-muted-foreground">—</span>}
                </div>
                <div className="col-span-2 sm:col-span-2 text-right tabular-nums text-ink">
                  <span className="sm:hidden text-xs text-muted-foreground mr-1">Upcoming</span>
                  {row.upcomingCount > 0 ? (
                    <span className="font-semibold text-brand-deep">{row.upcomingCount}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
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
          <option value="under_review">Under review</option>
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
  const dateLabel = new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div className={cn('flex items-center gap-3', detailed ? 'p-4' : 'py-2')}>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ink truncate text-sm">
          {row.subject_name ?? (row.source_type === 'subscription' ? 'Subscription' : 'Session')}
          {row.student_name ? ` · ${row.student_name}` : ''}
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
    in_escrow:         { label: 'In escrow',         cls: 'bg-peach/50 text-ink' },
    awaiting_transfer: { label: 'Awaiting transfer', cls: 'bg-amber-100 text-amber-800' },
    paid:              { label: 'Paid',              cls: 'bg-brand-soft text-brand-deep' },
    reversed:          { label: 'Reversed',          cls: 'bg-coral-soft text-coral' },
    under_review:      { label: 'Under Review',      cls: 'bg-amber-100 text-amber-700' },
    unknown:           { label: '—',                 cls: 'bg-zinc-100 text-zinc-600' },
  };
  const { label, cls } = config[status];
  return <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', cls)}>{label}</span>;
}

// ── Group Tracker ──────────────────────────────────────────────────────────────

function GroupTrackerTab({ tutorId }: { tutorId: string }) {
  const [groups, setGroups] = useState<GroupTrackerGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tutorId) return;
    fetch('/api/tutor/wallet/groups')
      .then((r) => r.json())
      .then((json) => setGroups(json.groups ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tutorId]);

  const totals = useMemo(() => ({
    activeSubscribers: groups.reduce((s, g) => s + g.active_count, 0),
    earnedThisMonth:   groups.reduce((s, g) => s + g.earned_this_month_ttd, 0),
    projected:         groups.reduce((s, g) => s + g.projected_this_month_ttd, 0),
    waitingForPayout:  groups.reduce((s, g) => s + g.waiting_for_payout_ttd, 0),
  }), [groups]);

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" /> <span className="text-sm">Loading groups…</span>
    </div>
  );

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
        <Users className="size-10 mx-auto text-muted-foreground/40" />
        <p className="mt-3 text-sm font-semibold text-ink">No group classes yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Create a group class to track subscription payments here.</p>
        <Link href="/tutor/classes/new" className="mt-4 inline-flex items-center gap-1 text-sm text-brand hover:underline font-semibold">
          Create a class →
        </Link>
      </div>
    );
  }

  const monthLabel = new Date().toLocaleDateString('en-TT', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Active subscribers</div>
          <div className="mt-1.5 text-2xl font-bold text-ink tabular-nums">{totals.activeSubscribers}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">across {groups.length} class{groups.length === 1 ? '' : 'es'}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Earned this month</div>
          <div className="mt-1.5 text-2xl font-bold text-brand-deep tabular-nums">TT$ {fmtTTD(totals.earnedThisMonth)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{monthLabel}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Projected this month</div>
          <div className="mt-1.5 text-2xl font-bold text-blue-600 tabular-nums">TT$ {fmtTTD(totals.projected)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">from active subscribers</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Awaiting payout</div>
          <div className="mt-1.5 text-2xl font-bold text-ink tabular-nums">TT$ {fmtTTD(totals.waitingForPayout)}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">in escrow or ready</div>
        </div>
      </div>

      {groups.map((g) => (
        <GroupCard key={g.id} group={g} />
      ))}
    </div>
  );
}

function GroupCard({ group: g }: { group: GroupTrackerGroup }) {
  const [expanded, setExpanded] = useState(g.subscribers.length <= 5);

  const subscriberCount = g.subscribers.length;
  const capacityLabel = `${g.active_count}${g.max_students ? `/${g.max_students}` : ''} subscriber${g.active_count === 1 ? '' : 's'}`;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-ink text-base">{g.name}</span>
              {g.subject_name && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-soft text-brand-deep font-semibold">{g.subject_name}</span>
              )}
              {g.status === 'DRAFT' && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-semibold">Draft</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {capacityLabel}
              {g.price_monthly != null && <span> · TT$ {fmtTTD(g.price_monthly)}/mo</span>}
            </div>
          </div>
          <Link href={`/tutor/classes/${g.id}`}
            className="flex items-center gap-1 text-xs text-brand-deep font-semibold hover:underline shrink-0">
            View roster <ExternalLink className="size-3" />
          </Link>
        </div>

        {/* Financial metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
            <div className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold">Earned this month</div>
            <div className="mt-1 font-bold text-emerald-700 tabular-nums text-sm">TT$ {fmtTTD(g.earned_this_month_ttd)}</div>
            <div className="text-[10px] text-emerald-600/70 mt-0.5">{g.paid_this_month_count} payment{g.paid_this_month_count === 1 ? '' : 's'}</div>
          </div>
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
            <div className="text-[10px] uppercase tracking-wider text-blue-600 font-bold">Projected</div>
            <div className="mt-1 font-bold text-blue-700 tabular-nums text-sm">TT$ {fmtTTD(g.projected_this_month_ttd)}</div>
            <div className="text-[10px] text-blue-600/70 mt-0.5">{g.active_count} active sub{g.active_count === 1 ? '' : 's'}</div>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
            <div className="text-[10px] uppercase tracking-wider text-amber-600 font-bold">Pending / unpaid</div>
            <div className="mt-1 font-bold text-amber-700 tabular-nums text-sm">{g.pending_count} student{g.pending_count === 1 ? '' : 's'}</div>
            <div className="text-[10px] text-amber-600/70 mt-0.5">grace or overdue</div>
          </div>
          <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Awaiting payout</div>
            <div className="mt-1 font-bold text-ink tabular-nums text-sm">TT$ {fmtTTD(g.waiting_for_payout_ttd)}</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">in escrow or ready</div>
          </div>
        </div>
      </div>

      {/* Subscriber list */}
      {subscriberCount === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">No subscribers yet.</div>
      ) : (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full px-5 py-2.5 flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-ink hover:bg-muted/20 transition"
          >
            <span>{subscriberCount} subscriber{subscriberCount === 1 ? '' : 's'}</span>
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>

          {expanded && (
            <div className="border-t border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-bold px-4 py-2 min-w-[160px]">Subscriber</th>
                    <th className="text-left font-bold px-3 py-2 min-w-[90px]">Status</th>
                    <th className="text-right font-bold px-3 py-2 min-w-[80px]">Plan price</th>
                    <th className="text-center font-bold px-3 py-2 min-w-[90px]">This month</th>
                    <th className="text-right font-bold px-3 py-2 min-w-[90px]">Last paid</th>
                    <th className="text-right font-bold px-3 py-2 min-w-[90px]">Next due</th>
                    <th className="text-right font-bold px-3 py-2 min-w-[90px]">Access until</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {g.subscribers.map((sub) => (
                    <SubscriberRow key={sub.enrollment_id} sub={sub} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubscriberRow({ sub }: { sub: GroupSubscriber }) {
  const initial = (sub.student_name?.[0] ?? '?').toUpperCase();
  const [imgFailed, setImgFailed] = useState(false);

  const statusConfig: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    ACTIVE:            { label: 'Active',    icon: <CheckCircle2 className="size-3" />, cls: 'bg-emerald-100 text-emerald-700' },
    GRACE:             { label: 'Grace',     icon: <Clock className="size-3" />,        cls: 'bg-amber-100 text-amber-700' },
    SUSPENDED:         { label: 'Suspended', icon: <XCircle className="size-3" />,      cls: 'bg-rose-100 text-rose-700' },
    PENDING_PAYMENT:   { label: 'Pending',   icon: <Clock className="size-3" />,        cls: 'bg-zinc-100 text-zinc-500' },
    ACTIVATION_FAILED: { label: 'Failed',    icon: <XCircle className="size-3" />,      cls: 'bg-rose-100 text-rose-700' },
  };
  const sc = statusConfig[sub.status] ?? { label: sub.status, icon: null, cls: 'bg-zinc-100 text-zinc-600' };

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-TT', { month: 'short', day: 'numeric' }) : '—';

  return (
    <tr className="hover:bg-muted/20">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-7 rounded-full bg-muted grid place-items-center overflow-hidden shrink-0">
            {sub.student_avatar_url && !imgFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sub.student_avatar_url} alt={sub.student_name ?? ''} className="size-7 object-cover"
                onError={() => setImgFailed(true)} />
            ) : (
              <span className="text-[10px] font-semibold text-muted-foreground">{initial}</span>
            )}
          </div>
          <div className="min-w-0">
            <span className="font-medium text-ink truncate text-xs block">{sub.student_name ?? 'Student'}</span>
            {sub.cancel_at_period_end && (
              <span className="text-[10px] text-amber-600">Cancels at period end</span>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', sc.cls)}>
          {sc.icon} {sc.label}
        </span>
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-xs text-ink">
        {sub.plan_price_ttd != null ? `TT$ ${fmtTTD(sub.plan_price_ttd)}` : '—'}
      </td>
      <td className="px-3 py-3 text-center">
        {sub.paid_this_month ? (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="size-2.5" /> Paid
          </span>
        ) : sub.status === 'PENDING_PAYMENT' ? (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-500">
            <Clock className="size-2.5" /> Pending
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
            <AlertCircle className="size-2.5" /> Unpaid
          </span>
        )}
      </td>
      <td className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
        {fmtDate(sub.last_paid_at)}
      </td>
      <td className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
        {fmtDate(sub.next_payment_due_at)}
      </td>
      <td className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
        {fmtDate(sub.current_period_end)}
      </td>
    </tr>
  );
}

// ── Payouts Tab ────────────────────────────────────────────────────────────────

function PayoutsTab() {
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [hasAccount, setHasAccount] = useState(false);
  const [verified, setVerified] = useState(false);
  const [payoutName, setPayoutName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [branch, setBranch] = useState('');
  const [accountType, setAccountType] = useState('chequing');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tutor/payout-account');
        const json = await res.json();
        if (cancelled) return;
        if (json.account) {
          setHasAccount(true);
          setVerified(!!json.account.verified_at);
          setPayoutName(json.account.payout_name ?? '');
          setAccountNumber(json.account.payout_account_identifier ?? '');
          setBankName(json.account.bank_name ?? '');
          setBranch(json.account.branch ?? '');
          setAccountType(json.account.account_type ?? 'chequing');
        }
      } catch {
        // non-fatal
      } finally {
        if (!cancelled) setLoadingAccount(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function save() {
    setSaving(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/tutor/payout-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout_name: payoutName, payout_account_identifier: accountNumber, bank_name: bankName, branch, account_type: accountType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      setHasAccount(true);
      setVerified(false);
      setMessage('Bank details saved. Payouts will use this account.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loadingAccount) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> <span className="text-sm">Loading payout details…</span>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="rounded-2xl bg-mint p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <ArrowDownToLine className="size-3.5" /> Payouts
        </div>
        <div className="font-semibold text-ink mt-1">
          {hasAccount ? (verified ? 'Bank account verified ✓' : 'Bank account on file') : 'No payout method connected yet'}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          iTutor pays out tutor earnings via bulk bank transfer. Your earnings accumulate as you teach paid sessions and are released on the next payout cycle.
        </div>
      </div>

      {error && <div className="rounded-xl bg-coral/10 border border-coral/30 p-3 text-sm text-coral">{error}</div>}
      {message && <div className="rounded-xl bg-mint border border-brand/30 p-3 text-sm text-ink">{message}</div>}

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-ink mb-1.5">Account holder name</label>
          <input type="text" value={payoutName} onChange={(e) => setPayoutName(e.target.value)}
            placeholder="As it appears on your bank statement"
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink mb-1.5">Bank</label>
          <select value={bankName} onChange={(e) => { setBankName(e.target.value); setBranch(''); }}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand">
            <option value="">Select bank…</option>
            {Object.keys(TT_BANKS).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {bankName && TT_BANKS[bankName] && (
            <div className="mt-1.5 text-[11px] text-muted-foreground font-mono">
              SWIFT: {TT_BANKS[bankName].swift} · Bank code: {TT_BANKS[bankName].code}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-ink mb-1.5">Branch</label>
          <select value={branch} onChange={(e) => setBranch(e.target.value)}
            disabled={!bankName || !TT_BANKS[bankName]}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60">
            <option value="">{bankName ? 'Select branch…' : 'Select bank first…'}</option>
            {(TT_BANKS[bankName]?.branches ?? []).map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink mb-1.5">Account number</label>
          <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}
            inputMode="numeric"
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink mb-1.5">Account type</label>
          <select value={accountType} onChange={(e) => setAccountType(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand">
            <option value="chequing">Chequing</option>
            <option value="savings">Savings</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-border">
        <button onClick={save} disabled={saving}
          className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
          {saving ? 'Saving…' : hasAccount ? 'Update bank details' : 'Save bank details'}
        </button>
      </div>
    </div>
  );
}
