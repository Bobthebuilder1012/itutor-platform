'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, TrendingUp, TrendingDown, DollarSign, Star, Calendar, AlertTriangle } from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';

type MonthData = { month: string; actual: number; projected: number; isCurrentMonth: boolean };

type Stats = {
  monthlyEarnings: MonthData[];
  projectedThisMonth: number;
  earnedThisMonth: number;
  totalSessions: number;
  totalEarnings: number;
  totalStudents: number;
  avgRating: number;
  ratingCount: number;
  completionRate: number;
};

const COMPLETED_STATUSES = ['COMPLETED_ASSUMED'];
const FINAL_STATUSES = ['COMPLETED_ASSUMED', 'NO_SHOW_STUDENT', 'NO_SHOW_TUTOR', 'EARLY_END_SHORT', 'CANCELLED'];

export default function TutorAnalyticsPage() {
  return (
    <TutorShell>
      <AnalyticsContent />
    </TutorShell>
  );
}

function AnalyticsContent() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const completion = useTutorCompletion(profile);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile?.id || !completion.listed) return;
    fetchStats(profile.id);
  }, [profile?.id, completion.listed]);

  async function fetchStats(tutorId: string) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const now = new Date();
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [{ data: sessions }, { data: ratings }, { data: upcoming }] = await Promise.all([
      supabase
        .from('sessions')
        .select('id, scheduled_start_at, status, payout_amount_ttd, student_id')
        .eq('tutor_id', tutorId)
        .gte('scheduled_start_at', sixMonthsAgo.toISOString()),
      supabase
        .from('ratings')
        .select('stars')
        .eq('tutor_id', tutorId),
      supabase
        .from('sessions')
        .select('id, scheduled_start_at, payout_amount_ttd')
        .eq('tutor_id', tutorId)
        .in('status', ['scheduled', 'confirmed'])
        .gte('scheduled_start_at', now.toISOString())
        .lt('scheduled_start_at', nextMonthEnd.toISOString()),
    ]);

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const months: MonthData[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      d.setDate(1);
      const label = d.toLocaleString(undefined, { month: 'short' });
      const monthStart = d.getTime();
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const isCurrent = monthStart === currentMonthStart;

      const actual = (sessions ?? [])
        .filter((s: any) => COMPLETED_STATUSES.includes(s.status) && new Date(s.scheduled_start_at).getTime() >= monthStart && new Date(s.scheduled_start_at).getTime() < monthEnd)
        .reduce((sum: number, s: any) => sum + Number(s.payout_amount_ttd ?? 0), 0);

      let projected = 0;
      if (isCurrent) {
        projected = (upcoming ?? [])
          .reduce((sum: number, s: any) => sum + (s.payout_amount_ttd ?? 0), 0);
      }

      months.push({ month: label, actual, projected, isCurrentMonth: isCurrent });
    }

    const currentMonth = months.find((m) => m.isCurrentMonth);
    const earnedThisMonth = currentMonth?.actual ?? 0;
    const projectedThisMonth = earnedThisMonth + (currentMonth?.projected ?? 0);

    const completed = (sessions ?? []).filter((s: any) => COMPLETED_STATUSES.includes(s.status));
    const totalSessions = completed.length;
    const totalEarnings = completed.reduce((sum: number, s: any) => sum + Number(s.payout_amount_ttd ?? 0), 0);
    const studentSet = new Set<string>();
    completed.forEach((s: any) => {
      if (s.student_id) studentSet.add(s.student_id);
    });

    const stars = (ratings ?? []).map((r: any) => r.stars);
    const avgRating = stars.length ? stars.reduce((a: number, b: number) => a + b, 0) / stars.length : 0;

    const totalFinal = (sessions ?? []).filter((s: any) => FINAL_STATUSES.includes(s.status)).length;
    const completionRate = totalFinal ? (totalSessions / totalFinal) * 100 : 0;

    setStats({
      monthlyEarnings: months,
      projectedThisMonth,
      earnedThisMonth,
      totalSessions,
      totalEarnings,
      totalStudents: studentSet.size,
      avgRating,
      ratingCount: stars.length,
      completionRate,
    });
  }

  if (completion.loading) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  if (!completion.listed) {
    return (
      <div className="max-w-7xl">
        <div className="rounded-2xl border border-border bg-card p-12 text-center max-w-2xl mx-auto">
          <Lock className="size-10 mx-auto text-muted-foreground/40" />
          <h2 className="mt-3 text-xl font-bold text-ink">Analytics are locked</h2>
          <p className="mt-2 text-sm text-muted-foreground">Complete your tutor profile to unlock student insights, earnings trends, and performance metrics.</p>
          <Link href="/tutor/get-listed" className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-deep">
            Complete profile
          </Link>
        </div>
      </div>
    );
  }

  if (!stats) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  const maxEarning = Math.max(...stats.monthlyEarnings.map((m) => m.actual + m.projected), 1);

  const pastMonths = stats.monthlyEarnings.filter((m) => !m.isCurrentMonth && m.actual > 0);
  const avgPastMonthly = pastMonths.length ? pastMonths.reduce((s, m) => s + m.actual, 0) / pastMonths.length : 0;
  const isWeakMonth = avgPastMonthly > 0 && stats.projectedThisMonth < avgPastMonthly * 0.7;

  return (
    <div className="max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Track your performance over the last 6 months.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card label="Total earnings" value={`TT$ ${stats.totalEarnings.toLocaleString()}`} icon={DollarSign} />
        <Card label="Earned this month" value={`TT$ ${stats.earnedThisMonth.toLocaleString()}`} icon={DollarSign} />
        <Card label="Projected this month" value={`TT$ ${stats.projectedThisMonth.toLocaleString()}`} icon={TrendingUp} accent={isWeakMonth ? 'warn' : undefined} />
        <Card label="Sessions completed" value={String(stats.totalSessions)} icon={Calendar} />
        <Card label="Avg rating" value={stats.ratingCount > 0 ? `${stats.avgRating.toFixed(1)} (${stats.ratingCount})` : '—'} icon={Star} />
      </div>

      {isWeakMonth && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <AlertTriangle className="size-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-900">This month is tracking below your average</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Projected TT$ {stats.projectedThisMonth.toLocaleString()} vs your {pastMonths.length}-month avg of TT$ {Math.round(avgPastMonthly).toLocaleString()}.
              Consider sharing your profile or reaching out to past students to book more sessions.
            </p>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-ink">Earnings — last 6 months</h3>
            <p className="text-xs text-muted-foreground">Actual payouts + projected from booked sessions (TTD)</p>
          </div>
          <TrendingUp className="size-5 text-brand-deep" />
        </div>
        <div className="flex items-center gap-4 mb-3 text-[11px]">
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-gradient-to-t from-emerald-500 to-emerald-600" /> Actual</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-blue-400/30 border border-blue-400/60 border-dashed" /> Projected</span>
        </div>
        <div className="grid grid-cols-6 gap-3 items-end h-48">
          {stats.monthlyEarnings.map((m, idx) => {
            const totalHeight = ((m.actual + m.projected) / maxEarning) * 100;
            const actualHeight = totalHeight > 0 ? (m.actual / (m.actual + m.projected)) * 100 : 0;
            const total = m.actual + m.projected;
            return (
              <div key={idx} className="flex flex-col items-center justify-end gap-2 h-full">
                <div className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {total > 0 ? `TT$ ${total.toLocaleString()}` : ''}
                </div>
                <div className="w-full rounded-t-lg overflow-hidden" style={{ height: `${totalHeight}%` }}>
                  {m.projected > 0 && (
                    <div className="w-full bg-blue-400/20 border border-dashed border-blue-400/50" style={{ height: `${100 - actualHeight}%` }} />
                  )}
                  <div className="w-full bg-gradient-to-t from-emerald-500 to-emerald-600" style={{ height: `${actualHeight}%` }} />
                </div>
                <div className={`text-xs font-semibold ${m.isCurrentMonth ? 'text-brand-deep' : 'text-muted-foreground'}`}>{m.month}{m.isCurrentMonth ? '*' : ''}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-semibold text-ink mb-3">Reliability</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Completion rate</span>
                <span className="font-semibold tabular-nums text-ink">{stats.completionRate.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-brand" style={{ width: `${stats.completionRate}%` }} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Sessions completed vs scheduled (excluding pending). Higher is better.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-semibold text-ink mb-3">Top metrics</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Avg per session</span><span className="font-semibold tabular-nums text-ink">TT$ {stats.totalSessions > 0 ? Math.round(stats.totalEarnings / stats.totalSessions) : 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Avg per student</span><span className="font-semibold tabular-nums text-ink">TT$ {stats.totalStudents > 0 ? Math.round(stats.totalEarnings / stats.totalStudents) : 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sessions per student</span><span className="font-semibold tabular-nums text-ink">{stats.totalStudents > 0 ? (stats.totalSessions / stats.totalStudents).toFixed(1) : 0}</span></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Card({ label, value, icon: Icon, accent }: { label: string; value: string; icon: typeof DollarSign; accent?: 'warn' }) {
  const isWarn = accent === 'warn';
  return (
    <div className={`rounded-xl border p-4 ${isWarn ? 'border-amber-300 bg-amber-50' : 'border-border bg-card'}`}>
      <div className="flex items-center justify-between">
        <div className={`size-9 rounded-lg grid place-items-center ${isWarn ? 'bg-amber-100 text-amber-600' : 'bg-brand/10 text-brand-deep'}`}>
          <Icon className="size-4" />
        </div>
        {isWarn && <TrendingDown className="size-4 text-amber-500" />}
      </div>
      <div className={`mt-3 text-2xl font-bold tracking-tight tabular-nums ${isWarn ? 'text-amber-900' : 'text-ink'}`}>{value}</div>
      <div className={`text-xs mt-0.5 ${isWarn ? 'text-amber-700' : 'text-muted-foreground'}`}>{label}</div>
    </div>
  );
}
