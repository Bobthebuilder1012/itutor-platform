'use client';

import { useEffect, useState, ComponentType } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users, CalendarDays, DollarSign, Eye, Lock, Plus, Clock, BookOpen,
  UserCircle, ArrowRight, Video, MessageSquare, Star, Wallet, PenLine, CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';
import ReliabilityPanel from '@/components/reliability/ReliabilityPanel';

type DashboardStats = {
  activeStudents: number;
  upcomingSessions: number;
  monthEarnings: number;
  profileViews: number;
};

type UpcomingSession = {
  id: string;
  date: string;
  subject: string;
  studentName: string;
  durationMin: number;
  type: '1-on-1' | 'Group class';
  joinUrl: string | null;
  groupId?: string;
};

type ActivityItem = {
  id: string;
  kind: 'inquiry' | 'review' | 'payout' | 'booking';
  text: string;
  at: string;
};

export default function TutorDashboardPage() {
  return (
    <TutorShell>
      <DashboardContent />
    </TutorShell>
  );
}

function DashboardContent() {
  const { profile, loading } = useProfile();
  const completion = useTutorCompletion(profile);
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({ activeStudents: 0, upcomingSessions: 0, monthEarnings: 0, profileViews: 0 });
  const [upcoming, setUpcoming] = useState<UpcomingSession[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [joinRequests, setJoinRequests] = useState<{ id: string; studentId: string; studentName: string; groupId: string; groupName: string; joinedAt: string }[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !profile) router.push('/login');
    if (!loading && profile && profile.role !== 'tutor') router.push('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchDashboardData(profile.id);

    // Realtime: refresh when join requests change
    const channel = supabase
      .channel(`dashboard-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_members' },
        () => { fetchDashboardData(profile.id); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_members' },
        () => { fetchDashboardData(profile.id); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  async function fetchDashboardData(tutorId: string) {
    setDataLoading(true);
    try {
      const now = new Date();
      const monthStartMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

      const [
        { data: upcomingData },
        { count: studentCount },
        walletRes,
      ] = await Promise.all([
        supabase
          .from('sessions')
          .select('id, scheduled_start_at, duration_minutes, join_url, booking:bookings(student_id, subject_id, profiles:profiles!bookings_student_id_fkey(full_name, display_name), subjects(label, name))')
          .eq('tutor_id', tutorId)
          .in('status', ['SCHEDULED', 'JOIN_OPEN', 'scheduled', 'in_progress'])
          .gte('scheduled_start_at', now.toISOString())
          .order('scheduled_start_at', { ascending: true })
          .limit(5),
        supabase
          .from('bookings')
          .select('student_id', { count: 'exact', head: true })
          .eq('tutor_id', tutorId)
          .in('status', ['CONFIRMED', 'confirmed']),
        fetch('/api/tutor/wallet').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      // Source of truth: payout_ledger via /api/tutor/wallet — matches the wallet's
      // "This month: TT$X" hint exactly.
      const monthTotal = ((walletRes?.history ?? []) as any[])
        .filter((h) => h.status === 'paid' && h.released_at && new Date(h.released_at).getTime() >= monthStartMs)
        .reduce((sum: number, h: any) => sum + Number(h.amount_ttd ?? 0), 0);

      const oneOnOneSessions: UpcomingSession[] = (upcomingData ?? []).map((s: any) => {
        const booking = Array.isArray(s.booking) ? s.booking[0] : s.booking;
        const studentProfile = booking?.profiles ? (Array.isArray(booking.profiles) ? booking.profiles[0] : booking.profiles) : null;
        const subject = booking?.subjects ? (Array.isArray(booking.subjects) ? booking.subjects[0] : booking.subjects) : null;
        return {
          id: s.id,
          date: s.scheduled_start_at ?? s.scheduled_start,
          subject: subject?.label || subject?.name || 'Session',
          studentName: studentProfile?.display_name || studentProfile?.full_name || 'Student',
          durationMin: s.duration_minutes ?? 60,
          type: '1-on-1',
          joinUrl: s.join_url ?? null,
        };
      });

      // Fetch upcoming group class sessions via API (bypasses RLS)
      const groupSessions: UpcomingSession[] = [];
      try {
        const res = await fetch('/api/tutor/upcoming-class-sessions', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          for (const s of json.sessions ?? []) {
            groupSessions.push({
              id: s.id,
              date: s.date,
              subject: s.className,
              studentName: s.className,
              durationMin: s.durationMin,
              type: 'Group class',
              joinUrl: s.joinUrl ?? null,
              groupId: s.groupId,
            });
          }
        }
      } catch { /* non-critical */ }

      const allUpcoming = [...oneOnOneSessions, ...groupSessions]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 8);

      setUpcoming(allUpcoming);

      setStats({
        activeStudents: studentCount ?? 0,
        upcomingSessions: allUpcoming.length,
        monthEarnings: monthTotal,
        profileViews: 0,
      });

      const { data: recentRatings } = await supabase
        .from('ratings')
        .select('id, stars, comment, created_at, student:profiles!ratings_student_id_fkey(full_name, display_name)')
        .eq('tutor_id', tutorId)
        .order('created_at', { ascending: false })
        .limit(3);

      const { data: recentBookings } = await supabase
        .from('bookings')
        .select('id, status, created_at, student:profiles!bookings_student_id_fkey(full_name, display_name)')
        .eq('tutor_id', tutorId)
        .order('created_at', { ascending: false })
        .limit(3);

      // Fetch pending join requests — use API to bypass RLS issues
      try {
        const res = await fetch('/api/tutor/pending-join-requests', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          setJoinRequests(json.requests ?? []);
        }
      } catch { /* non-critical */ }

      const acts: ActivityItem[] = [];
      (recentRatings ?? []).forEach((r: any) => {
        const studentProfile = Array.isArray(r.student) ? r.student[0] : r.student;
        const name = studentProfile?.display_name || studentProfile?.full_name || 'A student';
        acts.push({ id: `r-${r.id}`, kind: 'review', text: `${name} left a ${r.stars}-star review${r.comment ? `: "${r.comment.slice(0, 60)}${r.comment.length > 60 ? '…' : ''}"` : '.'}`, at: relTime(r.created_at) });
      });
      (recentBookings ?? []).forEach((b: any) => {
        const studentProfile = Array.isArray(b.student) ? b.student[0] : b.student;
        const name = studentProfile?.display_name || studentProfile?.full_name || 'A student';
        acts.push({ id: `b-${b.id}`, kind: 'booking', text: `${name} ${b.status === 'confirmed' ? 'confirmed a booking' : b.status === 'pending' ? 'requested a booking' : 'cancelled a booking'}.`, at: relTime(b.created_at) });
      });
      acts.sort((a, b) => 0);
      setActivity(acts.slice(0, 6));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setDataLoading(false);
    }
  }

  const listed = completion.listed;
  const firstName = (profile?.display_name || profile?.full_name || 'there').split(' ')[0];

  return (
    <div className="space-y-8 max-w-7xl">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">Welcome back, {firstName}.</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {listed ? "Here's what's happening with your students today." : 'Finish setting up your profile to unlock teaching tools.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/tutor/settings?section=teaching"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-background text-sm font-semibold text-ink hover:bg-muted transition">
            <PenLine className="size-3.5" /> Edit profile
          </Link>
          <Link href="/tutor/settings?section=payouts"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition">
            <CreditCard className="size-3.5" /> Add payout settings to earn
          </Link>
        </div>
      </header>

      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <StatCard icon={Users} label="Active students" value="23" locked={!listed} />
          <StatCard icon={CalendarDays} label="Upcoming sessions" value={String(stats.upcomingSessions)} locked={!listed} />
          <StatCard icon={DollarSign} label="This month (TTD)" value={stats.monthEarnings.toLocaleString()} locked={!listed} />
          <StatCard icon={Eye} label="Profile views" value={String(stats.profileViews)} locked={!listed} showLockIcon />
        </div>
      </section>

      {/* Join requests banner */}
      {joinRequests.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-amber-100 grid place-items-center shrink-0">
              <Clock className="size-4 text-amber-700" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-amber-900 text-sm">
                {joinRequests.length} pending join request{joinRequests.length !== 1 ? 's' : ''}
              </div>
              <div className="text-xs text-amber-700">Students are waiting for your approval.</div>
            </div>
          </div>
          <div className="space-y-2">
            {joinRequests.map((r) => (
              <JoinRequestRow
                key={r.id}
                request={r}
                onApprove={() => setJoinRequests((prev) => prev.filter((x) => x.id !== r.id))}
                onDecline={() => setJoinRequests((prev) => prev.filter((x) => x.id !== r.id))}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <ReliabilityPanel role="tutor" />
      </section>

      <section className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-ink">Upcoming sessions</h2>
              <p className="text-xs text-muted-foreground">Next 5 confirmed bookings</p>
            </div>
            <Link href="/tutor/sessions" className="text-xs font-semibold text-brand-deep hover:underline inline-flex items-center gap-1">
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          {dataLoading ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : upcoming.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <CalendarDays className="size-8 mx-auto text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">No upcoming sessions yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((s) => {
                const d = new Date(s.date);
                const isGroup = s.type === 'Group class';
                return (
                  <li key={s.id} className="px-5 py-3 flex items-center gap-3 hover:bg-muted/40 transition">
                    <div className={cn('size-9 rounded-lg grid place-items-center text-xs font-bold tabular-nums shrink-0',
                      isGroup ? 'bg-emerald-50 text-emerald-700' : 'bg-brand/10 text-brand-deep')}>
                      {d.getDate()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink truncate">{s.subject}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {s.durationMin}m
                      </div>
                    </div>
                    <span className={cn('hidden sm:inline-flex text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full',
                      isGroup ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground')}>
                      {s.type}
                    </span>
                    {isGroup && s.groupId ? (
                      <Link href={`/tutor/classes/${s.groupId}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted">
                        View class
                      </Link>
                    ) : s.joinUrl ? (
                      <a href={s.joinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90">
                        <Video className="size-3" /> Join
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">No link</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold text-ink">Quick actions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Jump into common tasks</p>
          <div className="mt-4 space-y-2">
            <QuickAction to="/tutor/classes" icon={Plus} label="Create a lesson" gated={!listed} />
            <QuickAction to="/tutor/availability" icon={Clock} label="Manage availability" />
            <QuickAction to="/tutor/wallet" icon={Wallet} label="My Wallet" />
            <QuickAction to="/tutor/students" icon={UserCircle} label="My Students" />
          </div>
        </div>
      </section>

      <section className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold text-ink">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 text-sm">
                  <span className="size-7 rounded-full bg-muted text-muted-foreground grid place-items-center mt-0.5 shrink-0">
                    {a.kind === 'inquiry' && <MessageSquare className="size-3.5" />}
                    {a.kind === 'review' && <Star className="size-3.5" />}
                    {a.kind === 'payout' && <Wallet className="size-3.5" />}
                    {a.kind === 'booking' && <CalendarDays className="size-3.5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-ink">{a.text}</div>
                    <div className="text-xs text-muted-foreground">{a.at}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold text-ink">Tools</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Always available</p>
          <Link href="/tutor/tools" className="mt-4 block text-center text-sm font-semibold px-3 py-2 rounded-lg bg-muted hover:bg-muted/70 text-ink">
            Open tools
          </Link>
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, locked, showLockIcon }: { icon: ComponentType<{ className?: string }>; label: string; value: string; locked: boolean; showLockIcon?: boolean }) {
  if (showLockIcon && !locked) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex flex-col items-center justify-center gap-1.5 min-h-[100px]">
        <Lock className="size-5 text-muted-foreground" />
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    );
  }
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 relative', locked && 'opacity-60')}>
      <div className="flex items-center justify-between">
        <div className="size-9 rounded-lg bg-brand/10 text-brand-deep grid place-items-center">
          <Icon className="size-4" />
        </div>
        {locked && (
          <span title="Available once your profile is complete." className="text-muted-foreground">
            <Lock className="size-3.5" />
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-ink tabular-nums">{locked ? '—' : value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function QuickAction({ to, icon: Icon, label, gated }: { to: string; icon: ComponentType<{ className?: string }>; label: string; gated?: boolean }) {
  if (gated) {
    return (
      <button title="Available once your profile is complete." disabled
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground cursor-not-allowed">
        <Icon className="size-4" />
        <span className="flex-1 text-left">{label}</span>
        <Lock className="size-3.5" />
      </button>
    );
  }
  return (
    <Link href={to} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border text-sm font-medium text-ink hover:bg-muted transition">
      <Icon className="size-4 text-brand-deep" />
      <span className="flex-1 text-left">{label}</span>
      <ArrowRight className="size-3.5 text-muted-foreground" />
    </Link>
  );
}

function JoinRequestRow({ request, onApprove, onDecline }: {
  request: { id: string; studentId: string; studentName: string; groupId: string; groupName: string };
  onApprove: () => void;
  onDecline: () => void;
}) {
  const [loading, setLoading] = useState<'approve' | 'decline' | null>(null);

  const act = async (status: 'approved' | 'removed', cb: () => void) => {
    setLoading(status === 'approved' ? 'approve' : 'decline');
    try {
      const res = await fetch(`/api/groups/${request.groupId}/members/${request.studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) cb();
    } catch { /* silent */ } finally { setLoading(null); }
  };

  return (
    <div className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-amber-200">
      <div className="size-8 rounded-full bg-gradient-to-br from-brand to-emerald-400 grid place-items-center text-white text-xs font-bold shrink-0">
        {request.studentName.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ink text-sm truncate">{request.studentName}</div>
        <div className="text-xs text-muted-foreground truncate">wants to join <Link href={`/tutor/classes/${request.groupId}`} className="text-brand-deep hover:underline">{request.groupName}</Link></div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button disabled={loading !== null} onClick={() => act('removed', onDecline)}
          className="px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted disabled:opacity-50">
          {loading === 'decline' ? '…' : 'Decline'}
        </button>
        <button disabled={loading !== null} onClick={() => act('approved', onApprove)}
          className="px-2.5 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90 disabled:opacity-50">
          {loading === 'approve' ? '…' : 'Approve'}
        </button>
      </div>
    </div>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
