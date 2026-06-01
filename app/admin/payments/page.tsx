'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import {
  DollarSign, TrendingUp, Clock, ShieldAlert,
  CheckCircle, RotateCcw, Loader2, ArrowRight, AlertCircle,
  Banknote,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentStats {
  total_collected_ttd:  number;
  total_refunded_ttd:   number;
  pending_payout_ttd:   number;
  available_payout_ttd: number;
  held_payout_ttd:      number;
  released_payout_ttd:  number;
  platform_fees_ttd:    number;
  open_cases_count:     number;
}

interface RecentPayment {
  id: string;
  amount_ttd: number;
  status: string;
  total_refunded_ttd: number | null;
  created_at: string;
  booking: {
    session: { tutor: { full_name: string } | null; student_profile: { full_name: string } | null } | null;
  } | null;
}

function fmtTTD(n: number | null | undefined) {
  if (n == null) return '—';
  return `TT$ ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-TT', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, color = 'gray', href,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color?: 'gray' | 'green' | 'amber' | 'blue' | 'rose' | 'purple';
  href?: string;
}) {
  const colorMap = {
    gray:   'bg-white border-gray-200',
    green:  'bg-emerald-50 border-emerald-200',
    amber:  'bg-amber-50 border-amber-200',
    blue:   'bg-blue-50 border-blue-200',
    rose:   'bg-rose-50 border-rose-200',
    purple: 'bg-purple-50 border-purple-200',
  };
  const iconColorMap = {
    gray:   'text-gray-500',
    green:  'text-emerald-600',
    amber:  'text-amber-600',
    blue:   'text-blue-600',
    rose:   'text-rose-600',
    purple: 'text-purple-600',
  };

  const inner = (
    <div className={`rounded-2xl border p-5 ${colorMap[color]} ${href ? 'hover:shadow-md transition cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className={`size-10 rounded-xl flex items-center justify-center ${iconColorMap[color]} bg-white/70`}>
          {icon}
        </div>
      </div>
      {href && (
        <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-gray-600">
          View details <ArrowRight className="size-3" />
        </div>
      )}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPaymentsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  useEffect(() => {
    if (!authLoading) loadData();
  }, [authLoading]);

  async function loadData() {
    setLoading(true); setError('');
    try {
      const [statsRes, paymentsData] = await Promise.all([
        fetch('/api/admin/payments/stats').then((r) => r.json()),
        supabase
          .from('payments')
          .select(`
            id, amount_ttd, status, total_refunded_ttd, created_at,
            booking:bookings!booking_id(
              session:sessions!booking_id(
                tutor:profiles!tutor_id(full_name),
                student_profile:profiles!student_id(full_name)
              )
            )
          `)
          .in('status', ['succeeded', 'partially_refunded', 'refunded'])
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      if (statsRes.error) throw new Error(statsRes.error);
      setStats(statsRes);
      setRecentPayments((paymentsData.data as any) ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return (
      <DashboardLayout role="admin" userName="Admin">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="max-w-6xl mx-auto space-y-8 p-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments Overview</h1>
          <p className="text-sm text-gray-500 mt-1">
            Platform-wide payment stats and payout status.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
        )}

        {loading || !stats ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="size-5 animate-spin" /> <span className="text-sm">Loading stats…</span>
          </div>
        ) : (
          <>
            {/* Key stats */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Platform totals (all time)
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Total collected"
                  value={fmtTTD(stats.total_collected_ttd)}
                  sub="Gross revenue from sessions + groups"
                  icon={<DollarSign className="size-5" />}
                  color="green"
                />
                <StatCard
                  label="Platform fees"
                  value={fmtTTD(stats.platform_fees_ttd)}
                  sub="Net after tutor payouts"
                  icon={<TrendingUp className="size-5" />}
                  color="blue"
                />
                <StatCard
                  label="Total refunded"
                  value={fmtTTD(stats.total_refunded_ttd)}
                  sub="Student refunds issued"
                  icon={<RotateCcw className="size-5" />}
                  color="rose"
                />
                <StatCard
                  label="Released to tutors"
                  value={fmtTTD(stats.released_payout_ttd)}
                  sub="Paid out via batch"
                  icon={<CheckCircle className="size-5" />}
                  color="purple"
                />
              </div>
            </section>

            {/* Payout pipeline */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Payout pipeline (current)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  label="In escrow (pending)"
                  value={fmtTTD(stats.pending_payout_ttd)}
                  sub="Waiting out grace period"
                  icon={<Clock className="size-5" />}
                  color="gray"
                  href="/admin/payouts"
                />
                <StatCard
                  label="Ready to release"
                  value={fmtTTD(stats.available_payout_ttd)}
                  sub="Can be batched now"
                  icon={<Banknote className="size-5" />}
                  color="green"
                  href="/admin/payouts"
                />
                <StatCard
                  label={`Held (${stats.open_cases_count} case${stats.open_cases_count === 1 ? '' : 's'})`}
                  value={fmtTTD(stats.held_payout_ttd)}
                  sub="Awaiting admin decision"
                  icon={<ShieldAlert className="size-5" />}
                  color={stats.open_cases_count > 0 ? 'amber' : 'gray'}
                  href="/admin/payout-cases"
                />
              </div>
            </section>

            {/* Held cases alert */}
            {stats.open_cases_count > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
                <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900">
                    {stats.open_cases_count} payout case{stats.open_cases_count === 1 ? '' : 's'} need your attention
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {fmtTTD(stats.held_payout_ttd)} is held pending admin review and not available for batch release.
                  </p>
                </div>
                <Link
                  href="/admin/payout-cases"
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                >
                  Review holdings →
                </Link>
              </div>
            )}

            {/* Quick links */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Quick actions
              </h2>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/admin/payouts"
                  className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Banknote className="size-4" /> Manage payouts
                </Link>
                <Link
                  href="/admin/payout-cases"
                  className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <ShieldAlert className="size-4" /> Payout holdings
                </Link>
                <Link
                  href="/admin/refunds"
                  className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <RotateCcw className="size-4" /> Refunds
                </Link>
              </div>
            </section>

            {/* Recent payments */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                Recent payments
              </h2>
              {recentPayments.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No recent payments.</p>
              ) : (
                <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Tutor / Student</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-right">Refunded</th>
                        <th className="px-4 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recentPayments.map((p) => {
                        const session = (p.booking?.session as any)?.[0] ?? p.booking?.session;
                        const tutorName   = session?.tutor?.full_name ?? '—';
                        const studentName = session?.student_profile?.full_name ?? '—';
                        return (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-500 tabular-nums">{fmtDate(p.created_at)}</td>
                            <td className="px-4 py-3">
                              <span className="font-medium text-gray-900">{tutorName}</span>
                              <span className="text-gray-400 mx-1">→</span>
                              <span className="text-gray-600">{studentName}</span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                              {fmtTTD(p.amount_ttd)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-rose-600">
                              {p.total_refunded_ttd ? fmtTTD(p.total_refunded_ttd) : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <PaymentStatusChip status={p.status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function PaymentStatusChip({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    succeeded:          'bg-emerald-100 text-emerald-800',
    partially_refunded: 'bg-amber-100 text-amber-800',
    refunded:           'bg-rose-100 text-rose-800',
    failed:             'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
