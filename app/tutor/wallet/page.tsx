'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, ArrowDownToLine, TrendingUp, Search, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';

type Tab = 'overview' | 'transactions' | 'payouts' | 'statements';

type Tx = {
  id: string;
  date: string;
  studentName: string;
  subject: string;
  gross: number;
  fee: number;
  net: number;
  status: 'paid' | 'pending' | 'failed';
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
  const [txs, setTxs] = useState<Tx[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchTransactions(profile.id);
  }, [profile?.id]);

  async function fetchTransactions(tutorId: string) {
    setDataLoading(true);
    try {
      const { data } = await supabase
        .from('sessions')
        .select('id, scheduled_start, status, charge_amount_ttd, payout_amount_ttd, platform_fee_ttd, booking:bookings(payment_status, profiles:profiles!bookings_student_id_fkey(full_name, display_name), subjects(label, name))')
        .eq('tutor_id', tutorId)
        .order('scheduled_start', { ascending: false })
        .limit(200);
      const mapped: Tx[] = (data ?? []).map((s: any) => {
        const booking = Array.isArray(s.booking) ? s.booking[0] : s.booking;
        const studentProfile = booking?.profiles ? (Array.isArray(booking.profiles) ? booking.profiles[0] : booking.profiles) : null;
        const subject = booking?.subjects ? (Array.isArray(booking.subjects) ? booking.subjects[0] : booking.subjects) : null;
        const ps = booking?.payment_status;
        return {
          id: s.id,
          date: s.scheduled_start,
          studentName: studentProfile?.display_name || studentProfile?.full_name || 'Student',
          subject: subject?.label || subject?.name || 'Session',
          gross: s.charge_amount_ttd ?? 0,
          fee: s.platform_fee_ttd ?? 0,
          net: s.payout_amount_ttd ?? 0,
          status: ps === 'paid' || ps === 'released' || ps === 'release_ready' ? 'paid' : ps === 'failed' ? 'failed' : 'pending',
        };
      });
      setTxs(mapped);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setDataLoading(false);
    }
  }

  const summary = useMemo(() => {
    const lifetime = txs.filter((t) => t.status === 'paid').reduce((s, t) => s + t.net, 0);
    const pending = txs.filter((t) => t.status === 'pending').reduce((s, t) => s + t.net, 0);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const month = txs.filter((t) => t.status === 'paid' && new Date(t.date).getTime() >= monthStart).reduce((s, t) => s + t.net, 0);
    return { lifetime, pending, month };
  }, [txs]);

  return (
    <div className="max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">My Wallet</h1>
        <p className="text-sm text-muted-foreground mt-1">Earnings, transactions, and payouts.</p>
      </header>

      <div className="border-b border-border flex items-center gap-6 text-sm">
        {(['overview', 'transactions', 'payouts', 'statements'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('relative pb-3 font-semibold capitalize transition', tab === t ? 'text-ink' : 'text-muted-foreground hover:text-ink')}>
            {t}
            {tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-gradient-to-br from-ink to-forest p-6 text-white shadow-pop">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60 font-semibold">
              <Wallet className="size-3.5" /> Available balance
            </div>
            <div className="mt-2 text-4xl font-bold tabular-nums">TT$ {summary.lifetime.toLocaleString()}</div>
            <div className="mt-1 text-sm text-white/70">{summary.pending > 0 ? `+ TT$ ${summary.pending.toLocaleString()} pending` : 'No pending balance'}</div>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <Stat label="This month" value={`TT$ ${summary.month.toLocaleString()}`} icon={TrendingUp} />
            <Stat label="Lifetime earnings" value={`TT$ ${summary.lifetime.toLocaleString()}`} icon={Wallet} />
            <Stat label="Pending" value={`TT$ ${summary.pending.toLocaleString()}`} icon={ArrowDownToLine} />
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="font-semibold text-ink">Recent transactions</h3>
            <div className="mt-4 space-y-2">
              {dataLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : txs.slice(0, 5).length === 0 ? (
                <p className="text-sm text-muted-foreground">No transactions yet.</p>
              ) : txs.slice(0, 5).map((t) => <TxRow key={t.id} t={t} />)}
            </div>
          </div>
        </div>
      )}

      {tab === 'transactions' && (
        <TransactionsTab txs={txs} loading={dataLoading} />
      )}

      {tab === 'payouts' && (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <ArrowDownToLine className="size-8 mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-ink">Payouts coming soon</p>
          <p className="mt-1 text-xs text-muted-foreground">Connect a bank account in Settings → Payouts to enable automatic payouts.</p>
        </div>
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

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Wallet }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <Icon className="size-4 text-brand-deep" />
      </div>
      <div className="mt-2 text-2xl font-bold text-ink tabular-nums">{value}</div>
    </div>
  );
}

function TransactionsTab({ txs, loading }: { txs: Tx[]; loading: boolean }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'paid' | 'pending' | 'failed'>('all');
  const filtered = txs.filter((t) =>
    (status === 'all' || t.status === status) &&
    (search === '' || t.studentName.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase()))
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transactions…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | 'paid' | 'pending' | 'failed')}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm">
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No transactions match your filters.</div>
        ) : filtered.map((t) => <TxRow key={t.id} t={t} detailed />)}
      </div>
    </div>
  );
}

function TxRow({ t, detailed }: { t: Tx; detailed?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', detailed ? 'p-4' : 'py-2')}>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ink truncate text-sm">{t.subject} · {t.studentName}</div>
        <div className="text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      </div>
      {detailed && (
        <div className="hidden sm:block text-right text-xs text-muted-foreground">
          <div>Gross TT$ {t.gross.toLocaleString()}</div>
          <div>Fee -TT$ {t.fee.toLocaleString()}</div>
        </div>
      )}
      <div className="text-right">
        <div className="font-bold text-ink tabular-nums">TT$ {t.net.toLocaleString()}</div>
        <StatusPill status={t.status} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: 'paid' | 'pending' | 'failed' }) {
  const m = {
    paid: 'bg-brand-soft text-brand-deep',
    pending: 'bg-peach/50 text-ink',
    failed: 'bg-coral-soft text-coral',
  }[status];
  return <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', m)}>{status}</span>;
}
