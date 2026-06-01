'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Video, MessageSquare, CheckCircle2, XCircle, Star, Users, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
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
  cancelled: boolean;
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

type ClassSessionRow = {
  id: string;
  groupId: string;
  className: string;
  date: string;
  durationMin: number;
  type: 'class';
};

function SessionsContent() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<'upcoming' | 'past' | 'pending'>('upcoming');
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [classSessions, setClassSessions] = useState<ClassSessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    fetchSessions(profile.id);
    fetchClassSessions(profile.id);
  }, [profile?.id]);

  async function fetchClassSessions(tutorId: string) {
    try {
      // Query only THIS tutor's groups directly — avoids the public groups API
      const { data: groups, error } = await supabase
        .from('groups')
        .select('id, name')
        .eq('tutor_id', tutorId)
        .is('archived_at', null);
      if (error || !groups?.length) return;
      const now = new Date();
      const all: ClassSessionRow[] = [];
      await Promise.all(groups.map(async (grp: any) => {
        try {
          const sRes = await fetch(`/api/groups/${grp.id}/sessions`, { cache: 'no-store' });
          if (!sRes.ok) return;
          const { sessions } = await sRes.json();
          for (const s of sessions ?? []) {
            for (const o of s.occurrences ?? []) {
              const dt = o.scheduled_start_at;
              if (!dt) continue;
              all.push({ id: o.id, groupId: grp.id, className: grp.name, date: dt, durationMin: s.duration_minutes ?? 60, type: 'class' });
            }
          }
        } catch { /* skip */ }
      }));
      setClassSessions(all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    } catch { /* non-critical */ }
  }

  async function fetchSessions(_tutorId: string) {
    setLoading(true);
    try {
      const res = await fetch('/api/tutor/sessions', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setRows(json.sessions ?? []);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return rows
      .filter((r) => r.status === tab)
      .sort((a, b) => {
        // Cancelled rows always sink to the bottom, regardless of date.
        if (a.cancelled !== b.cancelled) return a.cancelled ? 1 : -1;
        return tab === 'past'
          ? new Date(b.date).getTime() - new Date(a.date).getTime()
          : new Date(a.date).getTime() - new Date(b.date).getTime();
      });
  }, [rows, tab]);

  const now = new Date();
  const upcomingClassSessions = classSessions.filter((cs) => new Date(cs.date) > now);
  const pastClassSessions = classSessions.filter((cs) => new Date(cs.date) <= now);

  const counts = {
    upcoming: rows.filter((r) => r.status === 'upcoming').length + upcomingClassSessions.length,
    past: rows.filter((r) => r.status === 'past').length + pastClassSessions.length,
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
        ) : filtered.length === 0 && (tab === 'pending' || (tab === 'upcoming' ? upcomingClassSessions.length === 0 : pastClassSessions.length === 0)) ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {tab === 'upcoming' ? 'No upcoming sessions.' : tab === 'past' ? 'No past sessions yet.' : 'No pending requests.'}
          </div>
        ) : (
          <>
            {/* Class sessions */}
            {tab !== 'pending' && (tab === 'upcoming' ? upcomingClassSessions : pastClassSessions).map((cs) => {
              const d = new Date(cs.date);
              const durLabel = cs.durationMin < 60 ? `${cs.durationMin}m` : cs.durationMin % 60 === 0 ? `${cs.durationMin / 60}h` : `${Math.floor(cs.durationMin / 60)}h ${cs.durationMin % 60}m`;
              return (
                <div key={`class-${cs.id}`} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 bg-brand/5">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="size-12 rounded-xl grid place-items-center text-center shrink-0 bg-brand/10 text-brand-deep">
                      <div className="leading-tight">
                        <div className="text-[10px] uppercase font-bold">{d.toLocaleString(undefined, { month: 'short' })}</div>
                        <div className="text-base font-bold tabular-nums">{d.getDate()}</div>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-ink flex items-center gap-2">
                        {cs.className}
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-soft text-forest flex items-center gap-1">
                          <Users className="size-3" /> Group class
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {durLabel}
                      </div>
                    </div>
                  </div>
                  <TutorClassJoinButton groupId={cs.groupId} />
                  <a href={`/tutor/classes/${cs.groupId}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted">
                    View class
                  </a>
                </div>
              );
            })}
            {/* 1-on-1 sessions */}
            {filtered.map((s) => {
            const d = new Date(s.date);
            return (
              <div key={s.id} className={cn('p-4 flex flex-col sm:flex-row sm:items-center gap-3', s.cancelled && 'opacity-60')}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn(
                    'size-12 rounded-xl grid place-items-center text-center shrink-0',
                    s.cancelled ? 'bg-coral-soft text-coral' : 'bg-brand/10 text-brand-deep'
                  )}>
                    <div className="leading-tight">
                      <div className="text-[10px] uppercase font-bold">{d.toLocaleString(undefined, { month: 'short' })}</div>
                      <div className="text-base font-bold tabular-nums">{d.getDate()}</div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className={cn('font-semibold truncate flex items-center gap-2', s.cancelled ? 'text-muted-foreground line-through' : 'text-ink')}>
                      {s.subject}
                      {s.cancelled && <span className="no-underline text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-coral-soft text-coral">Cancelled</span>}
                      {!s.cancelled && s.attendance === 'no_show' && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-coral-soft text-coral">No-show</span>}
                      {!s.cancelled && s.attendance === 'attended' && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-soft text-brand-deep">Attended</span>}
                    </div>
                    <div className={cn('text-xs text-muted-foreground truncate', s.cancelled && 'line-through')}>
                      {s.studentName} · {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {s.durationMin}m
                      {!s.cancelled && s.paymentStatus && <> · <PayPill status={s.paymentStatus} /></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.cancelled ? (
                    <Link href={`/tutor/bookings/${s.bookingId}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted">View</Link>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              </div>
            );
          })}
          </>
        )}
      </div>
    </div>
  );
}

function PayPill({ status }: { status: 'paid' | 'pending' | 'overdue' }) {
  const m = { paid: 'text-brand-deep', pending: 'text-amber-600', overdue: 'text-coral' }[status];
  return <span className={cn('font-semibold capitalize', m)}>{status}</span>;
}

function TutorClassJoinButton({ groupId }: { groupId: string }) {
  const [loading, setLoading] = useState(false);

  const join = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/meeting-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const json = await res.json();
      const url = json?.join_url;
      if (url) window.open(url, '_blank', 'noreferrer');
      else alert(json?.error ?? 'Could not generate meeting link');
    } catch {
      alert('Could not get meeting link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={join} disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-60">
      <Video className="size-4" /> {loading ? 'Getting link…' : 'Join'}
    </button>
  );
}
