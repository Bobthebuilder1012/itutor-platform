'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Video, MessageCircle, Paperclip, Bell, Link as LinkIcon, MessageSquare, Globe, Check as CheckIcon,
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
  whatsapp_link: string | null;
  google_classroom_link: string | null;
};

type Tab = 'stream' | 'sessions' | 'members' | 'whatsapp' | 'classroom';
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
  const [rawMemberStatus, setRawMemberStatus] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState<string | null>(null);
  const [suspendedUntil, setSuspendedUntil] = useState<Date | null>(null);
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
      const res = await fetch(`/api/groups/${groupId}`, { cache: 'no-store' });
      if (!res.ok) { setLoading(false); return; }
      const payload = await res.json();
      const grp = payload?.group ?? payload?.data?.group;
      if (!grp) { setLoading(false); return; }

      const membership = grp.current_user_membership;
      setRawMemberStatus(membership?.status ?? null);
      // Default to 'removed' (not 'active') when no membership row exists —
      // a missing row means the student is not a current member and must
      // not receive class access by default.
      const s = membership?.status ?? 'removed';
      // Check if suspension has expired
      const suspUntil = membership?.suspended_until ? new Date(membership.suspended_until) : null;
      const suspExpired = suspUntil && suspUntil <= new Date();
      setMemberState(
        (s === 'suspended' || s === 'suspended_payment') && !suspExpired ? 'suspended'
        : s === 'banned' || s === 'removed' || s === 'rejected' ? 'banned'
        : s === 'approved' || s === 'active' || s === 'invited' ? 'active'
        : 'banned'
      );
      if (membership?.action_reason) setActionReason(membership.action_reason);
      if (suspUntil && !suspExpired) setSuspendedUntil(suspUntil);

      const enrollmentCount = grp.enrollment_count ?? grp.member_count ?? 0;
      const avgRating = typeof grp.average_rating === 'number' && grp.average_rating > 0
        ? grp.average_rating
        : null;

      const nextOcc = grp.next_occurrence;
      const isReallyUpcoming = nextOcc?.scheduled_start_at && new Date(nextOcc.scheduled_start_at) > new Date();
      setHasNextSession(Boolean(isReallyUpcoming));
      setNextMeetingLink(grp.meeting_link ?? nextOcc?.meeting_link ?? null);

      const tutorObj = Array.isArray(grp.tutor) ? grp.tutor[0] : grp.tutor;
      const tutor = tutorObj
        ? {
            full_name: tutorObj.full_name ?? null,
            display_name: tutorObj.display_name ?? tutorObj.full_name ?? null,
          }
        : null;

      setGroup({
        id: grp.id,
        name: grp.name,
        subject: grp.subject ?? null,
        tutor_id: grp.tutor_id,
        tutor,
        primary_channel: grp.primary_channel ?? null,
        enrollment_count: enrollmentCount,
        tutor_rating: avgRating,
        whatsapp_link: grp.whatsapp_link ?? grp.whatsapp_url ?? null,
        google_classroom_link: grp.google_classroom_link ?? null,
      });
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
        <Link href="/student/classes" className="mt-4 inline-block text-brand-deep font-semibold">← My Classes</Link>
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
      {/* Back link + Leave */}
      <div className="flex items-center justify-between">
        <Link href="/student/classes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
          <ArrowLeft className="size-4" /> All classes
        </Link>
        {/* Leave available when active OR suspended */}
        {(memberState === 'active' || memberState === 'suspended') && <LeaveClassButton groupId={groupId} />}
      </div>

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
            <JoinSessionButton groupId={groupId} staticLink={nextMeetingLink} />
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
              <strong>{tutorName}</strong> has paused your access. You can still see the class info but can't join sessions or view new posts.
            </p>
            {suspendedUntil && (
              <p className="text-sm text-amber-900 mt-1.5 font-semibold">
                Access restores: {suspendedUntil.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at {suspendedUntil.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
            {actionReason && (
              <p className="text-sm text-amber-900 mt-1 font-medium">Reason: "{actionReason}"</p>
            )}
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 shrink-0">
            <CreditCard className="size-4" /> Settle balance
          </button>
        </div>
      )}

      {/* Removed / Banned */}
      {memberState === 'banned' && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="size-12 rounded-xl bg-rose-100 grid place-items-center shrink-0">
            <Ban className="size-5 text-rose-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-rose-900">
              {rawMemberStatus === 'banned' ? "You've been banned from this class" : "You no longer have access to this class"}
            </div>
            <p className="text-sm text-rose-800 mt-0.5">
              {rawMemberStatus === 'banned'
                ? <><strong>{tutorName}</strong> has permanently removed you from <strong>{group.name}</strong>. You can&apos;t rejoin or request access.</>
                : <>You have been removed from <strong>{group.name}</strong>. If a refund is due, it will be processed by the admin.</>}
            </p>
            {actionReason && (
              <p className="text-sm text-rose-900 mt-2 font-medium">Reason: "{actionReason}"</p>
            )}
            <p className="text-xs text-rose-700 mt-2">If you think this was a mistake, contact iTutor support.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="mailto:support@myitutor.com?subject=Class ban dispute" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700">
                Contact support
              </a>
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
              { key: 'stream'    as const, label: 'Stream',     icon: MessageCircle },
              { key: 'sessions'  as const, label: 'Sessions',   icon: CalendarIcon },
              { key: 'members'   as const, label: 'Members',    icon: Users },
              ...(group.whatsapp_link ? [{ key: 'whatsapp'  as const, label: 'WhatsApp',   icon: MessageSquare }] : []),
              ...(group.google_classroom_link ? [{ key: 'classroom' as const, label: 'Classroom',  icon: Globe }] : []),
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

          {tab === 'stream'    && <StreamTab   groupId={groupId} group={group} tutorName={tutorName} />}
          {tab === 'sessions'  && <SessionsTab groupId={groupId} userId={profile!.id} />}
          {tab === 'members'   && <MembersTab  groupId={groupId} userId={profile!.id} />}
          {tab === 'whatsapp'  && <ExternalChannelTab groupId={groupId} platform="whatsapp"  url={group.whatsapp_link!} tutorName={tutorName} />}
          {tab === 'classroom' && <ExternalChannelTab groupId={groupId} platform="classroom" url={group.google_classroom_link!} tutorName={tutorName} />}
        </>
      )}
    </div>
  );
}

/* ─── Join session button ───────────────────────────── */

function JoinSessionButton({ groupId, staticLink }: { groupId: string; staticLink: string | null }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handleClick = async () => {
    if (staticLink) { window.open(staticLink, '_blank', 'noreferrer'); return; }
    setLoading(true); setErr('');
    try {
      const res = await fetch(`/api/groups/${groupId}/meeting-link`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'No link available yet');
      const url = json?.join_url;
      if (url) window.open(url, '_blank', 'noreferrer');
      else throw new Error('Meeting link not set up yet. Check back closer to the session.');
    } catch (e: any) {
      setErr(e?.message ?? 'Could not get link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shrink-0">
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-ink text-white font-semibold text-sm hover:bg-forest disabled:opacity-60 transition"
      >
        <Video className="size-4" /> {loading ? 'Getting link…' : 'Join next session'}
      </button>
      {err && (
        <div className="absolute mt-2 max-w-xs rounded-xl bg-background border border-border shadow-lg p-3 text-xs text-muted-foreground z-50">
          {err}
        </div>
      )}
    </div>
  );
}

/* ─── External channel tab ──────────────────────────── */

function ExternalChannelTab({ groupId, platform, url, tutorName }: {
  groupId: string;
  platform: 'whatsapp' | 'classroom';
  url: string;
  tutorName: string;
}) {
  const KEY = `itutor.joinedChannels.${groupId}`;
  const channelKey = platform === 'whatsapp' ? 'wa' : 'gc';

  const [joined, setJoined] = useState<boolean>(() => {
    try {
      const stored = JSON.parse(typeof window !== 'undefined' ? localStorage.getItem(KEY) || '{}' : '{}');
      return !!stored[channelKey];
    } catch { return false; }
  });

  const handleJoin = () => {
    window.open(url, '_blank', 'noreferrer');
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
      stored[channelKey] = true;
      localStorage.setItem(KEY, JSON.stringify(stored));
    } catch {}
    setJoined(true);
  };

  const isWhatsApp = platform === 'whatsapp';
  const platformName = isWhatsApp ? 'WhatsApp' : 'Google Classroom';
  const Icon = isWhatsApp ? MessageSquare : Globe;
  const color = isWhatsApp ? '#25D366' : '#1A73E8';
  const bgClass = isWhatsApp ? 'bg-[#25D366]' : 'bg-[#1A73E8]';

  return (
    <div className="max-w-md mx-auto space-y-5 py-4">
      {/* Icon + heading */}
      <div className="flex flex-col items-center text-center gap-4 py-6">
        <div className="size-16 rounded-2xl grid place-items-center text-white shadow-lg" style={{ background: color }}>
          <Icon className="size-8" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink">{platformName} group</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {tutorName} uses {platformName} to share announcements, materials, and schedule updates with this class.
          </p>
        </div>
      </div>

      {/* Join card */}
      <div className="rounded-2xl border border-border bg-background p-5 space-y-4">
        {joined ? (
          <div className="text-center space-y-3">
            <div className="size-12 rounded-full bg-brand/10 grid place-items-center mx-auto">
              <CheckIcon className="size-6 text-brand-deep" />
            </div>
            <div>
              <div className="font-semibold text-ink">You've joined the {platformName} group</div>
              <p className="text-sm text-muted-foreground mt-0.5">You can rejoin at any time using the button below.</p>
            </div>
            <button
              onClick={handleJoin}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition"
              style={{ background: color }}
            >
              <ExternalLink className="size-4" /> Open {platformName}
            </button>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <div>
              <div className="font-semibold text-ink">Join the {platformName} group</div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Stay up to date with reminders, materials, and class announcements.
              </p>
            </div>
            <button
              onClick={handleJoin}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold text-white transition hover:opacity-90 w-full justify-center"
              style={{ background: color }}
            >
              <Icon className="size-4" /> Join {platformName} group
            </button>
            <p className="text-[11px] text-muted-foreground">You'll be taken to {platformName} to join. Come back here after.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Channel join banner ────────────────────────────── */

function ChannelJoinBanner({ group, tutorName }: { group: Group; tutorName: string }) {
  const wa = group.whatsapp_link?.trim();
  const gc = group.google_classroom_link?.trim();
  if (!wa && !gc) return null;

  const KEY = `itutor.joinedChannels.${group.id}`;
  const [joined, setJoined] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(typeof window !== 'undefined' ? localStorage.getItem(KEY) || '{}' : '{}'); } catch { return {}; }
  });

  const mark = (k: 'wa' | 'gc') => {
    const next = { ...joined, [k]: true };
    setJoined(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  };

  const allJoined = (!wa || joined.wa) && (!gc || joined.gc);
  if (allJoined) return null;

  return (
    <div className="rounded-2xl border border-brand/30 bg-brand-soft/40 p-4">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-xl bg-brand text-white grid place-items-center shrink-0">
          <MessageCircle className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-ink">Join your class channels</div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tutorName} uses external channels to share reminders, materials, and updates. Join below so you don't miss anything.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {wa && !joined.wa && (
              <a href={wa} target="_blank" rel="noreferrer" onClick={() => mark('wa')}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#25D366] text-white text-sm font-semibold hover:opacity-90 transition">
                <MessageSquare className="size-4" /> Join WhatsApp group
              </a>
            )}
            {gc && !joined.gc && (
              <a href={gc} target="_blank" rel="noreferrer" onClick={() => mark('gc')}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-ink text-white text-sm font-semibold hover:bg-forest transition">
                <Globe className="size-4" /> Join Google Classroom
              </a>
            )}
            {wa && joined.wa && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep">
                <CheckIcon className="size-3.5" /> WhatsApp joined
              </span>
            )}
            {gc && joined.gc && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep">
                <CheckIcon className="size-3.5" /> Classroom joined
              </span>
            )}
          </div>
        </div>
      </div>
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
          const kind: StreamPost['kind'] =
            p.post_type === 'attachment' ? 'attachment'
            : p.post_type === 'link'     ? 'link'
            : 'announcement';

          const firstAttachment = (p.attachments ?? [])[0];

          const body = p.message_body ?? p.body ?? p.content ?? '';
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
        <ChannelJoinBanner group={group} tutorName={tutorName} />
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
        const res = await fetch(`/api/groups/${groupId}/sessions`, { cache: 'no-store' });
        const d = await res.json();

        setMeetingLink(d.meeting_link ?? null);
        const rawSessions: any[] = d.sessions ?? d.data ?? [];

        const allOccs: any[] = rawSessions.flatMap((s: any) =>
          (s.occurrences ?? []).map((o: any) => ({
            id: o.id,
            sessionId: s.id,
            topic: o.title ?? s.title ?? 'Class session',
            date: o.scheduled_start_at,
            durationMin: s.duration_minutes ?? 60,
            meetingLink: null as string | null,
          }))
        );

        const now = new Date();
        const upcoming = allOccs.filter(o => new Date(o.date) > now)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const past = allOccs.filter(o => new Date(o.date) <= now)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const sorted = [...upcoming, ...past];

        if (!sorted.length) { setSessions([]); return; }

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

/* ─── Leave class button ─────────────────────────────── */

function LeaveClassButton({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { profile } = useProfile();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const leave = useCallback(async () => {
    if (!profile) return;
    setLoading(true); setErr('');
    try {
      const res = await fetch(`/api/groups/${groupId}/members/${profile.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to leave');
      router.push('/student/classes');
    } catch (e: any) {
      setErr(e?.message ?? 'Something went wrong');
      setLoading(false);
    }
  }, [groupId, profile, reason, router]);

  const close = () => { setOpen(false); setReason(''); setErr(''); };

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="text-xs font-semibold text-muted-foreground hover:text-rose-600 transition">
        Leave class
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4" onClick={close}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-background border border-border shadow-xl p-6 space-y-4">
            <div className="font-bold text-ink text-lg">Leave this class?</div>
            <p className="text-sm text-muted-foreground">You'll lose access to the stream and sessions. You can rejoin later if the class is open.</p>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Reason <span className="normal-case font-normal">(optional)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Schedule conflict, found another tutor…"
                rows={2}
                className="mt-1.5 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
              />
            </div>
            {err && <p className="text-xs text-rose-600">{err}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={close} disabled={loading} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted">Cancel</button>
              <button onClick={leave} disabled={loading}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50">
                {loading ? 'Leaving…' : 'Leave class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
