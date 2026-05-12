'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Video, MessageSquare, CheckCircle2, XCircle, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';

type SessionRow = {
  id: string;
  bookingId: string;
  date: string;
  endDate: string;
  durationMin: number;
  subject: string;
  studentName: string;
  studentId: string | null;
  joinUrl: string | null;
  status: 'upcoming' | 'past' | 'pending';
  attendance: 'attended' | 'no_show' | 'cancelled' | null;
  paymentStatus: 'paid' | 'pending' | 'overdue' | null;
  reviewed: boolean;
};

export default function TutorSessionsPage() {
  return (
    <TutorShell>
      <SessionsContent />
    </TutorShell>
  );
}

function SessionsContent() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<'upcoming' | 'past' | 'pending'>('upcoming');
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    fetchSessions(profile.id);
  }, [profile?.id]);

  async function fetchSessions(tutorId: string) {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('id, booking_id, scheduled_start, scheduled_end, duration_minutes, status, join_url, student_attendance, ratings(stars), booking:bookings(student_id, profiles:profiles!bookings_student_id_fkey(full_name, display_name), subjects(label, name), payment_status)')
        .eq('tutor_id', tutorId)
        .order('scheduled_start', { ascending: false })
        .limit(100);

      const { data: pendingBookings } = await supabase
        .from('bookings')
        .select('id, requested_start_at, requested_end_at, profiles:profiles!bookings_student_id_fkey(id, full_name, display_name), subjects(label, name)')
        .eq('tutor_id', tutorId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      const sessions: SessionRow[] = (sessionData ?? []).map((s: any) => {
        const booking = Array.isArray(s.booking) ? s.booking[0] : s.booking;
        const studentProfile = booking?.profiles ? (Array.isArray(booking.profiles) ? booking.profiles[0] : booking.profiles) : null;
        const subject = booking?.subjects ? (Array.isArray(booking.subjects) ? booking.subjects[0] : booking.subjects) : null;
        const ratings = Array.isArray(s.ratings) ? s.ratings : [];
        const isPast = s.status === 'completed' || s.status === 'no_show' || new Date(s.scheduled_end ?? s.scheduled_start).getTime() < Date.now();
        return {
          id: s.id,
          bookingId: s.booking_id,
          date: s.scheduled_start,
          endDate: s.scheduled_end,
          durationMin: s.duration_minutes ?? 60,
          subject: subject?.label || subject?.name || 'Session',
          studentName: studentProfile?.display_name || studentProfile?.full_name || 'Student',
          studentId: booking?.student_id ?? null,
          joinUrl: s.join_url ?? null,
          status: isPast ? 'past' : 'upcoming',
          attendance: s.student_attendance ?? null,
          paymentStatus: booking?.payment_status === 'paid' ? 'paid' : booking?.payment_status === 'failed' ? 'overdue' : booking?.payment_status === 'pending' || booking?.payment_status === 'unpaid' ? 'pending' : null,
          reviewed: ratings.length > 0,
        };
      });

      const pending: SessionRow[] = (pendingBookings ?? []).map((b: any) => {
        const studentProfile = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles;
        const subject = Array.isArray(b.subjects) ? b.subjects[0] : b.subjects;
        const start = b.requested_start_at;
        const end = b.requested_end_at;
        const durationMin = start && end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000) : 60;
        return {
          id: `pending-${b.id}`,
          bookingId: b.id,
          date: start,
          endDate: end,
          durationMin,
          subject: subject?.label || subject?.name || 'Session request',
          studentName: studentProfile?.display_name || studentProfile?.full_name || 'Student',
          studentId: studentProfile?.id ?? null,
          joinUrl: null,
          status: 'pending',
          attendance: null,
          paymentStatus: null,
          reviewed: false,
        };
      });

      setRows([...sessions, ...pending]);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => r.status === tab).sort((a, b) =>
      tab === 'past'
        ? new Date(b.date).getTime() - new Date(a.date).getTime()
        : new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [rows, tab]);

  const counts = {
    upcoming: rows.filter((r) => r.status === 'upcoming').length,
    past: rows.filter((r) => r.status === 'past').length,
    pending: rows.filter((r) => r.status === 'pending').length,
  };

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">Sessions</h1>
        <p className="text-sm text-muted-foreground mt-1">Upcoming, past and pending tutoring sessions.</p>
      </header>

      <div className="inline-flex rounded-lg border border-border bg-card p-1">
        {(['upcoming', 'past', 'pending'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold capitalize',
              tab === t ? 'bg-brand text-white' : 'text-muted-foreground hover:text-ink')}>
            {t}
            <span className={cn('text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full', tab === t ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground')}>{counts[t]}</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading sessions…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {tab === 'upcoming' ? 'No upcoming sessions.' : tab === 'past' ? 'No past sessions yet.' : 'No pending requests.'}
          </div>
        ) : (
          filtered.map((s) => {
            const d = new Date(s.date);
            return (
              <div key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="size-12 rounded-xl bg-brand/10 text-brand-deep grid place-items-center text-center shrink-0">
                    <div className="leading-tight">
                      <div className="text-[10px] uppercase font-bold">{d.toLocaleString(undefined, { month: 'short' })}</div>
                      <div className="text-base font-bold tabular-nums">{d.getDate()}</div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-ink truncate flex items-center gap-2">
                      {s.subject}
                      {s.attendance === 'no_show' && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-coral-soft text-coral">No-show</span>}
                      {s.attendance === 'attended' && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-soft text-brand-deep">Attended</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.studentName} · {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {s.durationMin}m
                      {s.paymentStatus && <> · <PayPill status={s.paymentStatus} /></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {tab === 'upcoming' && (
                    <>
                      <Link href={`/tutor/bookings/${s.bookingId}`} className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted text-muted-foreground" title="Open thread">
                        <MessageSquare className="size-4" />
                      </Link>
                      {s.joinUrl ? (
                        <a href={s.joinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90">
                          <Video className="size-4" /> Join
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground px-3">No link</span>
                      )}
                    </>
                  )}
                  {tab === 'past' && (
                    <>
                      {!s.reviewed && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Star className="size-3.5" /> Awaiting review</span>}
                      <Link href={`/tutor/bookings/${s.bookingId}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted">View</Link>
                    </>
                  )}
                  {tab === 'pending' && (
                    <Link href={`/tutor/bookings/${s.bookingId}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90">
                      <CheckCircle2 className="size-4" /> Review request
                    </Link>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PayPill({ status }: { status: 'paid' | 'pending' | 'overdue' }) {
  const m = { paid: 'text-brand-deep', pending: 'text-amber-600', overdue: 'text-coral' }[status];
  return <span className={cn('font-semibold capitalize', m)}>{status}</span>;
}
