'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, TrendingUp, DollarSign, Star, Calendar } from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';

type MonthData = { month: string; actual: number; isCurrentMonth: boolean };

type Stats = {
  monthlyEarnings: MonthData[];
  earnedThisMonth: number;
  totalSessions: number;
  totalEarnings: number;
  totalStudents: number;
  avgRating: number;
  ratingCount: number;
  completionRate: number;
};

const COMPLETED_STATUSES = ['COMPLETED_ASSUMED'];
const FINAL_STATUSES = ['COMPLETED_ASSUMED', 'NO_SHOW_STUDENT', 'EARLY_END_SHORT', 'CANCELLED'];

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

    const [{ data: sessions }, { data: ratings }] = await Promise.all([
      supabase
        .from('sessions')
        .select('id, scheduled_start_at, status, payout_amount_ttd, student_id')
        .eq('tutor_id', tutorId)
        .gte('scheduled_start_at', sixMonthsAgo.toISOString()),
      supabase
        .from('ratings')
        .select('stars')
        .eq('tutor_id', tutorId),
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

      months.push({ month: label, actual, isCurrentMonth: isCurrent });
    }

    const currentMonth = months.find((m) => m.isCurrentMonth);
    const earnedThisMonth = currentMonth?.actual ?? 0;

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

  const maxEarning = Math.max(...stats.monthlyEarnings.map((m) => m.actual), 1);

  return (
    <div className="max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Track your performance over the last 6 months.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Total earnings" value={`TT$ ${stats.totalEarnings.toLocaleString()}`} icon={DollarSign} />
        <Card label="Earned this month" value={`TT$ ${stats.earnedThisMonth.toLocaleString()}`} icon={DollarSign} />
        <Card label="Sessions completed" value={String(stats.totalSessions)} icon={Calendar} />
        <Card label="Avg rating" value={stats.ratingCount > 0 ? `${stats.avgRating.toFixed(1)} (${stats.ratingCount})` : '—'} icon={Star} />
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-ink">Earnings — last 6 months</h3>
            <p className="text-xs text-muted-foreground">Completed session payouts (TTD)</p>
          </div>
          <TrendingUp className="size-5 text-brand-deep" />
        </div>
        <div className="grid grid-cols-6 gap-3 items-end h-48">
          {stats.monthlyEarnings.map((m, idx) => {
            const h = (m.actual / maxEarning) * 100;
            return (
              <div key={idx} className="flex flex-col items-center justify-end gap-2 h-full">
                <div className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {m.actual > 0 ? `TT$ ${m.actual.toLocaleString()}` : ''}
                </div>
                <div className="w-full bg-brand/20 rounded-t-lg" style={{ height: `${h}%` }}>
                  <div className="w-full h-full bg-gradient-to-t from-emerald-500 to-emerald-600 rounded-t-lg" />
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

function Card({ label, value, icon: Icon }: { label: string; value: string; icon: typeof DollarSign }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="size-9 rounded-lg grid place-items-center bg-brand/10 text-brand-deep">
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight tabular-nums text-ink">{value}</div>
      <div className="text-xs mt-0.5 text-muted-foreground">{label}</div>
    </div>
  );
}
