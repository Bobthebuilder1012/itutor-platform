'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Video, MessageCircle, Paperclip, Bell, Link as LinkIcon,
  Calendar as CalendarIcon, Users, Pin, ExternalLink, Star, Download,
  Clock, Check, X, ShieldAlert, Ban, CreditCard,
} from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

/* ─── Types ──────────────────────────────────────────── */

type Group = {
  id: string;
  name: string;
  subject: string | null;
  tutor_id: string;
  tutor: { full_name: string | null; display_name: string | null } | null;
  primary_channel: string | null;
  enrollment_count: number;
  tutor_rating: number | null;
};

type Tab = 'stream' | 'sessions' | 'members';
type MembershipState = 'active' | 'suspended' | 'banned';

type StreamPost = {
  id: string;
  kind: 'announcement' | 'attachment' | 'link';
  title: string;
  body: string;
  at: string;
  pinned?: boolean;
  attachmentName?: string | null;
  attachmentUrl?: string | null;
  linkUrl?: string | null;
};

type Session = {
  id: string;
  sessionId: string;
  date: string;
  durationMin: number;
  topic: string;
  attendance: 'attended' | 'missed' | 'pending';
  meetingLink?: string | null;
};

type Member = {
  id: string;
  name: string;
  initials: string;
  joined: string;
  self?: boolean;
};

/* ─── Color helper — maps subject → iTutor CSS color variable ─────── */

function subjectColor(subject: string | null): string {
  const s = (subject || '').toLowerCase();
  if (s.includes('math'))                          return 'coral';
  if (s.includes('physics'))                       return 'sky';
  if (s.includes('english') || s.includes('lit'))  return 'lavender';
  if (s.includes('bio'))                           return 'brand';
  if (s.includes('chem'))                          return 'peach';
  if (s.includes('econ') || s.includes('account')) return 'peach';
  if (s.includes('sea'))                           return 'lavender';
  if (s.includes('info') || s.includes('it'))      return 'sky';
  return 'brand';
}

function subjectEmoji(subject: string | null): string {
  const s = (subject || '').toLowerCase();
  if (s.includes('math'))    return '📐';
  if (s.includes('physics')) return '⚛️';
  if (s.includes('chem'))    return '🧪';
  if (s.includes('bio'))     return '🧬';
  if (s.includes('english')) return '📚';
  if (s.includes('history')) return '📜';
  if (s.includes('econ') || s.includes('account')) return '📊';
  if (s.includes('sea'))     return '✏️';
  if (s.includes('info') || s.includes('it')) return '💻';
  return '📖';
}

function initials(name: string) {
  return (name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function fmtJoined(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/* ─── Pill (sessions status badge) ──────────────────── */

function Pill({ tone, icon: Icon, label }: { tone: 'emerald' | 'rose' | 'amber' | 'slate'; icon?: React.ComponentType<{ className?: string }>; label: string }) {
  const cls = {
    emerald: 'bg-emerald-100 text-emerald-700',
    rose:    'bg-rose-100 text-rose-700',
    amber:   'bg-amber-100 text-amber-800',
    slate:   'bg-muted text-muted-foreground',
  }[tone];
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full', cls)}>
      {Icon && <Icon className="size-3" />} {label}
    </span>
  );
}

/* ─── Main page ──────────────────────────────────────── */

export default function EnrolledClassPage({ params }: { params: { groupId: string } }) {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const { groupId } = params;

  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('stream');
  const [memberState, setMemberState] = useState<MembershipState>('active');
  const [hasNextSession, setHasNextSession] = useState(false);
  const [nextMeetingLink, setNextMeetingLink] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile) { router.push('/login'); return; }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, profile, profileLoading]);

  async function load() {
    setLoading(true);
    try {
      const { data: grp } = await supabase
        .from('groups')
        .select('id, name, subject, tutor_id, primary_channel, meeting_link, tutor:profiles!groups_tutor_id_fkey(full_name, display_name)')
        .eq('id', groupId)
        .is('archived_at', null)
        .maybeSingle();

      if (!grp) { setLoading(false); return; }

      const { data: membership } = await supabase
        .from('group_members')
        .select('status')
        .eq('group_id', groupId)
        .eq('user_id', profile!.id)
        .maybeSingle();

      const s = membership?.status ?? 'active';
      setMemberState(
        s === 'suspended' || s === 'suspended_payment' ? 'suspended'
        : s === 'banned' || s === 'removed' || s === 'rejected' ? 'banned'
        : 'active'
      );

      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .in('status', ['active', 'approved']);

      const { data: ratingRows } = await supabase
        .from('ratings').select('stars').eq('tutor_id', grp.tutor_id);
      const ratings = (ratingRows ?? []).map((r: any) => Number(r.stars));
      const avgRating = ratings.length
        ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
        : null;

      const { data: nextOcc } = await supabase
        .from('group_session_occurrences')
        .select('id, scheduled_start_at, group_session_id')
        .gte('scheduled_start_at', new Date().toISOString())
        .order('scheduled_start_at', { ascending: true })
        .limit(1);

      const hasNext = (nextOcc?.length ?? 0) > 0;
      setHasNextSession(hasNext);
      // Use the group's static meeting link (Google Meet / Zoom) set by the tutor
      setNextMeetingLink((grp as any).meeting_link ?? null);

      const tutorObj = Array.isArray(grp.tutor) ? grp.tutor[0] : grp.tutor;
      setGroup({ ...grp, tutor: tutorObj, enrollment_count: count ?? 0, tutor_rating: avgRating });
    } catch (err) {
      console.error('[EnrolledClassPage]', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading || profileLoading) {
    return <div className="flex justify-center py-32"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  if (!group) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <h1 className="text-2xl font-bold text-ink">Class not found</h1>
        <Link href="/student/my-lessons" className="mt-4 inline-block text-brand-deep font-semibold">← My Classes</Link>
      </div>
    );
  }

  const color = subjectColor(group.subject);
  const emoji = subjectEmoji(group.subject);
  const tutorName = group.tutor?.display_name || group.tutor?.full_name || 'Your Tutor';
  const blocked = memberState !== 'active';

  const bannerStyle = {
    background: `linear-gradient(135deg, color-mix(in oklab, var(--${color}) 50%, white), color-mix(in oklab, var(--${color}) 20%, white))`,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back link */}
      <Link href="/student/my-lessons"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> All classes
      </Link>

      {/* Banner */}
      <div className="rounded-3xl p-6 lg:p-8 relative overflow-hidden" style={bannerStyle}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="text-5xl select-none">{emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-ink/70 font-bold">
              {group.subject || 'General'} · Group class
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-ink mt-1">{group.name}</h1>
            <div className="text-sm text-ink/80 mt-1 inline-flex items-center gap-1.5">
              with {tutorName}
              {group.tutor_rating !== null && (
                <>
                  <Star className="size-3.5 fill-amber-500 text-amber-500" />
                  <span className="font-semibold">{group.tutor_rating!.toFixed(1)}</span>
                </>
              )}
            </div>
          </div>
          {!blocked && hasNextSession && (
            <a
              href={nextMeetingLink || '#'}
              target={nextMeetingLink ? '_blank' : undefined}
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-ink text-white font-semibold text-sm hover:bg-forest shrink-0"
            >
              <Video className="size-4" /> Join next session
            </a>
          )}
        </div>
      </div>

      {/* Suspended */}
      {memberState === 'suspended' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="size-12 rounded-xl bg-amber-100 grid place-items-center shrink-0">
            <ShieldAlert className="size-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-amber-900">You're suspended from this class</div>
            <p className="text-sm text-amber-800 mt-0.5">
              <strong>{tutorName}</strong> has paused your access — usually because of an outstanding payment.
              You can still see the class info, but you can't join sessions, see new posts, or contact other members until you're reactivated.
            </p>
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 shrink-0">
            <CreditCard className="size-4" /> Settle balance
          </button>
        </div>
      )}

      {/* Banned */}
      {memberState === 'banned' && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="size-12 rounded-xl bg-rose-100 grid place-items-center shrink-0">
            <Ban className="size-5 text-rose-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-rose-900">You've been removed from this class</div>
            <p className="text-sm text-rose-800 mt-0.5">
              <strong>{tutorName}</strong> has banned you from <strong>{group.name}</strong>.
              You can't rejoin or request access. If you think this was a mistake, you can report it to iTutor support.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700">
                Contact support
              </button>
              <Link href="/student/find-tutors"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 text-xs font-semibold hover:bg-rose-100">
                Find another tutor
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Tabs + content */}
      {!blocked && (
        <>
          <div className="border-b border-border flex items-center gap-6 overflow-x-auto">
            {([
              { key: 'stream'   as const, label: 'Stream',   icon: MessageCircle },
              { key: 'sessions' as const, label: 'Sessions', icon: CalendarIcon },
              { key: 'members'  as const, label: 'Members',  icon: Users },
            ]).map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={cn('relative pb-3 text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap',
                    tab === t.key ? 'text-brand-deep' : 'text-muted-foreground hover:text-ink')}>
                  <Icon className="size-4" /> {t.label}
                  {tab === t.key && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-brand" />}
                </button>
              );
            })}
          </div>

          {tab === 'stream'   && <StreamTab   groupId={groupId} group={group} tutorName={tutorName} />}
          {tab === 'sessions' && <SessionsTab groupId={groupId} userId={profile!.id} />}
          {tab === 'members'  && <MembersTab  groupId={groupId} userId={profile!.id} />}
        </>
      )}
    </div>
  );
}

/* ─── Stream ─────────────────────────────────────────── */

function StreamTab({ groupId, group, tutorName }: { groupId: string; group: Group; tutorName: string }) {
  const [posts, setPosts] = useState<StreamPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/groups/${groupId}/stream`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const raw: any[] = d.posts ?? d.data ?? [];
        setPosts(raw.map((p: any) => {
          // Map stream_posts DB fields → StreamPost shape
          const kind: StreamPost['kind'] =
            p.post_type === 'attachment' ? 'attachment'
            : p.post_type === 'link'     ? 'link'
            : 'announcement';

          // Attachments come as nested array from the API
          const firstAttachment = (p.attachments ?? [])[0];

          const body = p.message_body ?? p.body ?? p.content ?? '';
          // Use first line as title, rest as body
          const lines = body.split('\n').filter(Boolean);
          const title = p.title ?? p.heading ?? lines[0] ?? '';
          const bodyText = lines.length > 1 ? lines.slice(1).join('\n') : body;

          const isLinked = kind === 'link';
          const linkUrl = p.link_url ?? p.url ?? (isLinked ? (p.metadata?.url ?? null) : null);

          return {
            id: p.id,
            kind,
            title,
            body: bodyText,
            at: p.created_at
              ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : '',
            pinned: p.pinned_at !== null && p.pinned_at !== undefined,
            attachmentName: firstAttachment?.file_name ?? p.attachment_name ?? null,
            attachmentUrl:  firstAttachment?.file_url  ?? p.attachment_url  ?? null,
            linkUrl,
          };
        }));
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [groupId]);

  const sorted = [...posts].sort((a, b) => (a.pinned ? -1 : 0) - (b.pinned ? -1 : 0));

  const meta: Record<StreamPost['kind'], { icon: React.ComponentType<{ className?: string }>; cls: string; tag: string }> = {
    announcement: { icon: Bell,      cls: 'bg-amber-100 text-amber-700',   tag: 'Announcement' },
    attachment:   { icon: Paperclip, cls: 'bg-violet-100 text-violet-700', tag: 'Attachment' },
    link:         { icon: LinkIcon,  cls: 'bg-sky-100 text-sky-700',        tag: 'Link' },
  };

  return (
    <div className="grid lg:grid-cols-[1fr,280px] gap-6">
      <div className="space-y-3">
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          The stream is read-only — your tutor posts here. Use Messages to reply.
        </div>

        {loading && <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>}

        {!loading && sorted.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            <MessageCircle className="size-8 mx-auto mb-3 opacity-30" />
            <p>No posts yet. Your tutor will post announcements here.</p>
          </div>
        )}

        {sorted.map((p) => {
          const M = meta[p.kind];
          const Icon = M.icon;
          return (
            <div key={p.id}
              className={cn('rounded-2xl bg-background border p-4 flex gap-3',
                p.pinned ? 'border-coral/40 ring-1 ring-coral/20' : 'border-border')}>
              <div className={cn('size-10 rounded-xl grid place-items-center shrink-0', M.cls)}>
                <Icon className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{M.tag}</span>
                  {p.pinned && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-coral-soft text-coral inline-flex items-center gap-1">
                      <Pin className="size-3" /> Pinned
                    </span>
                  )}
                </div>
                <div className="mt-1 font-semibold text-ink">{p.title}</div>
                <p className="text-sm text-muted-foreground mt-1">{p.body}</p>
                {p.attachmentName && (
                  <button
                    onClick={() => p.attachmentUrl && window.open(p.attachmentUrl, '_blank')}
                    className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-xs font-semibold text-ink hover:bg-muted">
                    <Download className="size-3.5" /> {p.attachmentName}
                  </button>
                )}
                {p.linkUrl && (
                  <a href={p.linkUrl} target="_blank" rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-xs font-semibold text-brand-deep hover:bg-brand-soft">
                    <ExternalLink className="size-3.5" /> {p.linkUrl}
                  </a>
                )}
                <div className="mt-2 text-[11px] text-muted-foreground">{p.at}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sidebar */}
      <aside className="space-y-4">
        <div className="rounded-2xl bg-background border border-border p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Class info</div>
          <div className="mt-3 space-y-2 text-sm">
            <InfoRow label="Tutor"   value={tutorName} />
            <InfoRow label="Subject" value={group.subject || '—'} />
            <InfoRow label="Format"  value="Group · weekly" />
          </div>
        </div>
        <div className="rounded-2xl bg-background border border-border p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pinned</div>
          <ul className="mt-3 space-y-2 text-sm">
            {sorted.filter(p => p.pinned).map(p => (
              <li key={p.id} className="flex items-start gap-2">
                <Pin className="size-3.5 text-coral mt-0.5 shrink-0" />
                <span className="text-ink line-clamp-2">{p.title}</span>
              </li>
            ))}
            {sorted.filter(p => p.pinned).length === 0 && (
              <li className="text-xs text-muted-foreground">Nothing pinned yet.</li>
            )}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">{label}</span>
      <span className="text-ink font-medium text-right truncate">{value}</span>
    </div>
  );
}

/* ─── Sessions ───────────────────────────────────────── */

function SessionsTab({ groupId, userId }: { groupId: string; userId: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [meetingLink, setMeetingLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Use the sessions API which returns group_sessions with nested occurrences
        const res = await fetch(`/api/groups/${groupId}/sessions`, { cache: 'no-store' });
        const d = await res.json();

        setMeetingLink(d.meeting_link ?? null);
        const rawSessions: any[] = d.sessions ?? d.data ?? [];

        // Flatten all occurrences from all sessions
        const allOccs: any[] = rawSessions.flatMap((s: any) =>
          (s.occurrences ?? []).map((o: any) => ({
            id: o.id,
            sessionId: s.id,
            topic: o.title ?? s.title ?? 'Class session',
            date: o.scheduled_start_at,
            durationMin: s.duration_minutes ?? 60,
            meetingLink: null as string | null, // populated via join-link API when session starts
          }))
        );

        // Sort: upcoming first, then most-recent past
        const now = new Date();
        const upcoming = allOccs.filter(o => new Date(o.date) > now)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const past = allOccs.filter(o => new Date(o.date) <= now)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const sorted = [...upcoming, ...past];

        if (!sorted.length) { setSessions([]); return; }

        // Fetch attendance records
        const occIds = sorted.map(o => o.id);
        const attMap: Record<string, 'attended' | 'missed'> = {};
        try {
          const { data: att } = await supabase
            .from('session_attendance')
            .select('occurrence_id, status')
            .eq('user_id', userId)
            .in('occurrence_id', occIds);
          (att ?? []).forEach((a: any) => {
            if (a.status === 'attended' || a.status === 'present') attMap[a.occurrence_id] = 'attended';
            else if (a.status === 'absent' || a.status === 'missed')  attMap[a.occurrence_id] = 'missed';
          });
        } catch { /* attendance table may not exist yet */ }

        setSessions(sorted.map(o => ({
          ...o,
          attendance: new Date(o.date) > now ? 'pending' : (attMap[o.id] ?? 'pending'),
        })));
      } catch (err) {
        console.error('[SessionsTab]', err);
        setSessions([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [groupId, userId]);

  if (loading) return <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>;

  if (!sessions.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        <CalendarIcon className="size-8 mx-auto mb-3 opacity-30" />
        <p>No sessions scheduled yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
        <Video className="size-3.5 mt-0.5 shrink-0 text-brand-deep" />
        <span>Meeting links are generated automatically from your tutor's connected Zoom or Google Meet account when each session starts.</span>
      </div>

      {sessions.map((s, i) => {
        const d = new Date(s.date);
        const future = d > new Date();
        const att = s.attendance;
        return (
          <div key={s.id ?? i}
            className="rounded-2xl bg-background border border-border p-4 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-3 md:w-72">
              <div className="text-center bg-brand-soft text-brand-deep rounded-lg px-3 py-1.5 leading-tight shrink-0">
                <div className="text-base font-bold tabular-nums">{d.getDate()}</div>
                <div className="text-[9px] uppercase font-bold tracking-wider">
                  {d.toLocaleString(undefined, { month: 'short' })}
                </div>
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-ink text-sm truncate">{s.topic}</div>
                <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' · '}
                  {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  {' · '}
                  {s.durationMin}m
                </div>
              </div>
            </div>

            <div className="flex flex-1 items-center gap-2 flex-wrap">
              {future ? (
                <Pill tone="amber"   icon={Clock} label="Upcoming" />
              ) : att === 'attended' ? (
                <Pill tone="emerald" icon={Check} label="Attended" />
              ) : att === 'missed' ? (
                <Pill tone="rose"    icon={X}     label="Missed" />
              ) : (
                <Pill tone="slate"               label="Pending" />
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {future && meetingLink && (
                <a
                  href={meetingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90">
                  <Video className="size-3.5" /> Join
                </a>
              )}
              {future && !meetingLink && (
                <span className="text-[11px] text-muted-foreground italic">No link set</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Members ────────────────────────────────────────── */

function MembersTab({ groupId, userId }: { groupId: string; userId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/groups/${groupId}/members`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const raw: any[] = d.members ?? d.data ?? [];
        setMembers(raw.map((m: any) => {
          const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile;
          const name = profile?.full_name || 'Student';
          return {
            id: m.id,
            name,
            initials: initials(name),
            joined: m.joined_at ? fmtJoined(m.joined_at) : '—',
            self: m.user_id === userId,
          };
        }));
      })
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [groupId, userId]);

  if (loading) return <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>;

  if (!members.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        <Users className="size-8 mx-auto mb-3 opacity-30" /><p>No other members yet.</p>
      </div>
    );
  }

  const sorted = [...members].sort((a, b) => (a.self ? -1 : b.self ? 1 : 0));

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{members.length} students in this class.</div>
      <div className="grid sm:grid-cols-2 gap-3">
        {sorted.map((m) => (
          <div key={m.id}
            className={cn('rounded-2xl border bg-background p-4 flex items-center gap-3',
              m.self ? 'border-brand bg-brand-soft/30' : 'border-border')}>
            <div className="size-10 rounded-full bg-gradient-to-br from-brand to-emerald-400 grid place-items-center text-white font-bold text-xs shrink-0">
              {m.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-ink text-sm truncate">
                {m.name}
                {m.self && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-deep">(you)</span>}
              </div>
              <div className="text-xs text-muted-foreground">Joined {m.joined}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
