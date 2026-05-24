'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Users, Clock, BarChart2, Settings, MessageSquare, CreditCard,
  Pin, Sparkles, Paperclip, Link2, Plus, Info, ExternalLink, Check, X,
  Megaphone, MoreVertical, Calendar, Globe, Lock, EyeOff, Shield,
  AlertTriangle, ChevronDown, RefreshCw, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import TutorShell from '@/components/tutor/TutorShell';
import type { GroupWithTutor } from '@/lib/types/groups';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'stream' | 'sessions' | 'roster' | 'payments' | 'settings' | 'analytics';

interface StreamPost {
  id: string;
  post_type: string;
  message_body: string;
  pinned_at: string | null;
  created_at: string;
  author?: { full_name?: string };
}

interface Member {
  id: string;
  user_id: string;
  status: 'invited' | 'active' | 'suspended' | 'removed';
  joined_at: string;
  profile?: { id: string; full_name?: string; avatar_url?: string } | null;
}

interface ClassPayment {
  id: string;
  class_member_id: string;
  session_id: string | null;
  billing_period: string | null;
  amount: number;
  status: 'due' | 'paid' | 'overdue' | 'waived';
  paid_at: string | null;
  created_at: string;
}

interface Occurrence {
  id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  status: string;
  meeting_link?: string | null;
  is_cancelled?: boolean;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ClassHubPage() {
  return <TutorShell><ClassHub /></TutorShell>;
}

function ClassHub() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useProfile();
  const [group, setGroup] = useState<GroupWithTutor | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('stream');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/groups/${id}`)
      .then((r) => r.json())
      .then((d) => setGroup(d?.group ?? d ?? null))
      .catch(() => setGroup(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
    </div>
  );

  if (!group) return (
    <div className="text-center py-20">
      <h1 className="text-xl font-bold text-ink">Class not found</h1>
      <Link href="/tutor/classes" className="mt-3 inline-block text-brand-deep font-semibold">← My Classes</Link>
    </div>
  );

  const isGroup = (group.max_students ?? 1) !== 1;
  const activeMembers = (group as any).member_count ?? 0;
  const isFull = group.max_students != null && activeMembers >= group.max_students;

  const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
    { id: 'stream', label: 'Stream', icon: MessageSquare },
    { id: 'sessions', label: 'Sessions', icon: Calendar },
    { id: 'roster', label: 'Roster', icon: Users },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'settings', label: 'Settings', icon: Settings },
    ...(isGroup ? [{ id: 'analytics' as Tab, label: 'Analytics', icon: BarChart2 }] : []),
  ];

  const gradients = ['from-brand to-brand-deep','from-violet-500 to-purple-700','from-sky-500 to-blue-700','from-amber-500 to-orange-600'];
  const gradient = gradients[group.name.charCodeAt(0) % gradients.length];

  return (
    <div className="space-y-0 -mt-6">
      {/* Banner */}
      <div className={cn('-mx-6 lg:-mx-8 h-44 lg:h-52 bg-gradient-to-br relative', group.cover_image ? '' : gradient)}
        style={group.cover_image ? { backgroundImage: `url(${group.cover_image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute top-4 left-6 lg:left-8 z-10">
          <Link href="/tutor/classes" className="inline-flex items-center gap-1 text-xs font-semibold text-white/90 hover:text-white">
            <ArrowLeft className="size-3.5" /> All Classes
          </Link>
        </div>
        <div className="absolute top-4 right-6 flex gap-2 z-10">
          {group.status === 'DRAFT' && <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-amber-100 text-amber-800">Draft</span>}
          {(group as any).visibility === 'private' && <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-white/20 text-white">🔒 Private</span>}
          {isFull && <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-black/40 text-white">Full</span>}
        </div>
        <div className="absolute bottom-5 left-6 lg:left-8 right-6 flex items-end justify-between gap-4 z-10">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white leading-tight">{group.name}</h1>
            <div className="text-white/80 text-sm mt-1">
              {[group.subject, group.form_level].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="hidden sm:flex gap-3">
            <div className="rounded-xl bg-white/10 backdrop-blur px-4 py-2.5 text-center text-white">
              <div className="text-xs font-semibold opacity-80">Members</div>
              <div className="text-xl font-bold tabular-nums">{activeMembers}{group.max_students ? `/${group.max_students}` : ''}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs bar */}
      <div className="-mx-6 lg:-mx-8 px-6 lg:px-8 border-b border-border bg-background overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn('relative flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold transition',
                  tab === t.id ? 'text-brand-deep' : 'text-muted-foreground hover:text-ink')}>
                <Icon className="size-4" /> {t.label}
                {tab === t.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-deep" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-6">
        {tab === 'stream'    && <StreamTab groupId={id} />}
        {tab === 'sessions'  && <SessionsTab groupId={id} />}
        {tab === 'roster'    && <RosterTab groupId={id} group={group} />}
        {tab === 'payments'  && <PaymentsTab groupId={id} />}
        {tab === 'settings'  && <SettingsTab group={group} setGroup={setGroup} />}
        {tab === 'analytics' && isGroup && <AnalyticsTab groupId={id} />}
      </div>
    </div>
  );
}

// ─── Stream tab ──────────────────────────────────────────────────────────────

type PostType = 'announcement' | 'link' | 'ai-recap';
const POST_META: Record<PostType, { icon: typeof MessageSquare; label: string; chip: string }> = {
  announcement: { icon: Megaphone, label: 'Announcement', chip: 'bg-brand-soft text-brand-deep' },
  link:         { icon: Link2,    label: 'Link',          chip: 'bg-sky-100 text-sky-700' },
  'ai-recap':   { icon: Sparkles, label: 'AI Recap',      chip: 'bg-amber-100 text-amber-700' },
};

function StreamTab({ groupId }: { groupId: string }) {
  const [posts, setPosts] = useState<StreamPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState<PostType | null>(null);
  const [draftBody, setDraftBody] = useState('');
  const [draftLink, setDraftLink] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/groups/${groupId}/stream`)
      .then((r) => r.json())
      .then((d) => setPosts(d?.posts ?? []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!composing || !draftBody.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/stream/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_type: composing === 'link' ? 'link' : 'announcement', message_body: draftBody.trim(), link_url: draftLink || undefined }),
      });
      if (res.ok) { setComposing(null); setDraftBody(''); setDraftLink(''); load(); }
    } finally { setPosting(false); }
  };

  const sorted = [...posts].sort((a, b) => (b.pinned_at ? 1 : 0) - (a.pinned_at ? 1 : 0));

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(POST_META) as PostType[]).map((k) => {
          const m = POST_META[k];
          const Icon = m.icon;
          return (
            <button key={k} onClick={() => setComposing(composing === k ? null : k)}
              className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition',
                composing === k ? `${m.chip} border-transparent` : 'border-border text-muted-foreground hover:text-ink')}>
              <Icon className="size-3.5" /> {m.label}
            </button>
          );
        })}
      </div>

      {composing && (
        <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
          <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)}
            placeholder={composing === 'ai-recap' ? 'Paste your session notes here — AI will refine after you save…' : 'Write your message…'}
            rows={3} className="w-full text-sm bg-transparent outline-none resize-none text-ink placeholder:text-muted-foreground" />
          {composing === 'link' && (
            <input value={draftLink} onChange={(e) => setDraftLink(e.target.value)} placeholder="https://…"
              className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-muted outline-none text-ink" />
          )}
          {composing === 'ai-recap' && (
            <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              You author the recap. Once posted you can optionally refine wording with AI — it never writes from a blank state.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setComposing(null)} className="text-xs font-semibold text-muted-foreground hover:text-ink px-3 py-1.5">Cancel</button>
            <button onClick={submit} disabled={posting || !draftBody.trim()}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand-deep disabled:opacity-40">
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-10 flex justify-center"><div className="animate-spin h-6 w-6 rounded-full border-b-2 border-brand" /></div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">No posts yet. Share an announcement with your class.</div>
      ) : (
        <div className="space-y-3">
          {sorted.map((p) => {
            const type = (p.post_type ?? 'announcement') as PostType;
            const meta = POST_META[type] ?? POST_META.announcement;
            const Icon = meta.icon;
            return (
              <div key={p.id} className={cn('rounded-2xl border bg-background p-4 flex gap-3', p.pinned_at && 'border-brand-soft bg-brand-soft/20')}>
                <div className={cn('size-10 rounded-xl grid place-items-center flex-shrink-0', meta.chip)}><Icon className="size-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-ink capitalize">{type.replace('-', ' ')}</span>
                    {p.pinned_at && <span className="text-[10px] font-bold uppercase tracking-wider text-brand-deep shrink-0">Pinned</span>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{p.message_body}</p>
                  <div className="text-xs text-muted-foreground mt-1.5">{new Date(p.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sessions tab ─────────────────────────────────────────────────────────────

function SessionsTab({ groupId }: { groupId: string }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkDraft, setLinkDraft] = useState<{ occId: string; url: string } | null>(null);
  const [savingLink, setSavingLink] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/groups/${groupId}/sessions`)
      .then((r) => r.json())
      .then((d) => {
        const sArr: any[] = d?.sessions ?? [];
        setSessions(sArr);
        const allOccs: Occurrence[] = sArr.flatMap((s: any) => s.occurrences ?? []);
        setOccurrences(allOccs.sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime()));
      })
      .catch(() => { setSessions([]); setOccurrences([]); })
      .finally(() => setLoading(false));
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  const attachLink = async () => {
    if (!linkDraft) return;
    setSavingLink(true);
    const sessionId = sessions.find((s) => (s.occurrences ?? []).some((o: any) => o.id === linkDraft.occId))?.id;
    if (!sessionId) { setSavingLink(false); return; }
    try {
      await fetch(`/api/groups/${groupId}/sessions/${sessionId}/occurrences/${linkDraft.occId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meeting_link: linkDraft.url }),
      });
      setLinkDraft(null);
      load();
    } finally { setSavingLink(false); }
  };

  const cancelOcc = async (sessionId: string, occId: string) => {
    if (!confirm('Cancel this session occurrence?')) return;
    await fetch(`/api/groups/${groupId}/sessions/${sessionId}/occurrences/${occId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    load();
  };

  const now = Date.now();
  const upcoming = occurrences.filter((o) => new Date(o.scheduled_start_at).getTime() > now && !o.is_cancelled && o.status !== 'cancelled');
  const past = occurrences.filter((o) => new Date(o.scheduled_start_at).getTime() <= now || o.is_cancelled || o.status === 'cancelled');

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-ink">Sessions</h2>
        <Link href={`/tutor/sessions`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand-deep">
          <Plus className="size-3.5" /> Schedule session
        </Link>
      </div>

      {loading ? <div className="py-10 flex justify-center"><div className="animate-spin h-6 w-6 rounded-full border-b-2 border-brand" /></div> : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Upcoming</div>
              {upcoming.map((o) => {
                const sessionId = sessions.find((s) => (s.occurrences ?? []).some((oc: any) => oc.id === o.id))?.id;
                return (
                  <div key={o.id} className="rounded-2xl border border-border bg-background p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-xs font-bold text-muted-foreground tabular-nums w-40 shrink-0">
                        {new Date(o.scheduled_start_at).toLocaleString('en', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                      <div className="flex-1 text-sm font-semibold text-ink">
                        {Math.round((new Date(o.scheduled_end_at).getTime() - new Date(o.scheduled_start_at).getTime()) / 60000)}min
                      </div>
                      {o.meeting_link ? (
                        <a href={o.meeting_link} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-semibold text-brand-deep inline-flex items-center gap-1">
                          Join <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <button onClick={() => setLinkDraft({ occId: o.id, url: '' })}
                          className="text-xs font-semibold text-muted-foreground hover:text-ink inline-flex items-center gap-1">
                          <Link2 className="size-3" /> Attach link
                        </button>
                      )}
                      {sessionId && (
                        <button onClick={() => cancelOcc(sessionId, o.id)}
                          className="text-xs text-coral hover:underline">Cancel</button>
                      )}
                    </div>
                    {linkDraft?.occId === o.id && (
                      <div className="mt-3 flex gap-2">
                        <input value={linkDraft.url} onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })}
                          placeholder="https://meet.google.com/… or https://zoom.us/j/…"
                          className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-brand" />
                        <button onClick={attachLink} disabled={savingLink || !linkDraft.url}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand text-white disabled:opacity-40">Save</button>
                        <button onClick={() => setLinkDraft(null)} className="text-xs text-muted-foreground">Cancel</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Past</div>
              {past.slice(0, 6).map((o) => (
                <div key={o.id} className={cn('rounded-2xl border border-border bg-background p-4 flex flex-wrap items-center gap-3', (o.is_cancelled || o.status === 'cancelled') && 'opacity-50')}>
                  <div className="text-xs font-bold text-muted-foreground tabular-nums w-40 shrink-0">
                    {new Date(o.scheduled_start_at).toLocaleString('en', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                  <div className="flex-1 text-sm text-muted-foreground">
                    {(o.is_cancelled || o.status === 'cancelled') ? 'Cancelled' : 'Completed'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {occurrences.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
              No sessions yet.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Roster tab ───────────────────────────────────────────────────────────────

function RosterTab({ groupId, group }: { groupId: string; group: GroupWithTutor }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [warnTarget, setWarnTarget] = useState<Member | null>(null);
  const [warnMsg, setWarnMsg] = useState('');
  const [sendingWarn, setSendingWarn] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/groups/${groupId}/members`)
      .then((r) => r.json())
      .then((d) => setMembers(d?.members ?? []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  const transition = async (userId: string, status: string) => {
    setActioningId(userId);
    try {
      await fetch(`/api/groups/${groupId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      load();
    } finally { setActioningId(null); setOpenMenuId(null); }
  };

  const sendWarn = async () => {
    if (!warnTarget || !warnMsg.trim()) return;
    setSendingWarn(true);
    try {
      await fetch(`/api/groups/${groupId}/members/${warnTarget.user_id}/warn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: warnMsg.trim() }),
      });
      setWarnTarget(null); setWarnMsg('');
      load();
    } finally { setSendingWarn(false); }
  };

  const statusChip: Record<string, string> = {
    active: 'bg-brand-soft text-brand-deep',
    invited: 'bg-muted text-muted-foreground',
    suspended: 'bg-amber-100 text-amber-800',
    removed: 'bg-coral-soft text-coral',
  };

  const active = members.filter((m) => m.status === 'active');
  const invited = members.filter((m) => m.status === 'invited');
  const suspended = members.filter((m) => m.status === 'suspended');

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-ink">
          Roster <span className="text-muted-foreground font-normal text-sm">({active.length}{group.max_students ? `/${group.max_students}` : ''})</span>
        </h2>
        <button className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:bg-muted">
          <Plus className="size-3.5" /> Invite student
        </button>
      </div>

      {/* Warn modal */}
      {warnTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-background rounded-2xl border border-border p-5 w-full max-w-md space-y-3 shadow-pop">
            <h3 className="font-bold text-ink">Send warning to {warnTarget.profile?.full_name ?? 'student'}</h3>
            <p className="text-xs text-muted-foreground">You are authoring this message. AI may help refine, but you send it explicitly.</p>
            <textarea value={warnMsg} onChange={(e) => setWarnMsg(e.target.value)}
              placeholder="e.g. Your payment is overdue. Please settle within 7 days or access will be suspended."
              rows={4} className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-muted outline-none resize-none focus:ring-2 focus:ring-brand" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setWarnTarget(null); setWarnMsg(''); }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:bg-muted">Cancel</button>
              <button onClick={sendWarn} disabled={sendingWarn || !warnMsg.trim()}
                className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40">
                {sendingWarn ? 'Sending…' : 'Send warning'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-10 flex justify-center"><div className="animate-spin h-6 w-6 rounded-full border-b-2 border-brand" /></div>
      ) : members.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">No students enrolled yet.</div>
      ) : (
        <div className="space-y-2">
          {[...active, ...invited, ...suspended].map((m) => {
            const name = m.profile?.full_name ?? 'Student';
            const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
            const isActioning = actioningId === m.user_id;
            const menuOpen = openMenuId === m.user_id;

            return (
              <div key={m.user_id} className="rounded-2xl border border-border bg-background p-4 flex flex-wrap items-center gap-3">
                <div className="size-9 rounded-full bg-brand-soft grid place-items-center font-bold text-brand-deep text-sm shrink-0">
                  {m.profile?.avatar_url ? <img src={m.profile.avatar_url} className="size-9 rounded-full object-cover" alt="" /> : initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink">{name}</div>
                  {m.joined_at && <div className="text-xs text-muted-foreground">Joined {new Date(m.joined_at).toLocaleDateString('en', { month: 'short', year: 'numeric' })}</div>}
                </div>
                <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', statusChip[m.status])}>{m.status}</span>

                {/* Actions menu */}
                <div className="relative">
                  <button onClick={() => setOpenMenuId(menuOpen ? null : m.user_id)}
                    className="size-7 rounded-full hover:bg-muted grid place-items-center">
                    <MoreVertical className="size-3.5 text-muted-foreground" />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-8 z-20 w-44 rounded-xl bg-background border border-border shadow-pop p-1 text-sm">
                      {m.status === 'invited' && (
                        <button onClick={() => transition(m.user_id, 'active')} disabled={isActioning}
                          className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted text-ink text-xs">
                          <Check className="size-3.5 text-brand" /> Approve
                        </button>
                      )}
                      {m.status === 'active' && (
                        <button onClick={() => setWarnTarget(m)}
                          className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted text-ink text-xs">
                          <AlertTriangle className="size-3.5 text-amber-500" /> Send warning
                        </button>
                      )}
                      {m.status === 'active' && (
                        <button onClick={() => transition(m.user_id, 'suspended')} disabled={isActioning}
                          className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted text-ink text-xs">
                          <Shield className="size-3.5 text-amber-600" /> Suspend
                        </button>
                      )}
                      {m.status === 'suspended' && (
                        <button onClick={() => transition(m.user_id, 'active')} disabled={isActioning}
                          className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted text-ink text-xs">
                          <Check className="size-3.5 text-brand" /> Lift suspension
                        </button>
                      )}
                      <button onClick={() => transition(m.user_id, 'removed')} disabled={isActioning}
                        className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-coral-soft text-coral text-xs">
                        <X className="size-3.5" /> Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Payments tab ─────────────────────────────────────────────────────────────

function PaymentsTab({ groupId }: { groupId: string }) {
  const [payments, setPayments] = useState<ClassPayment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [waiving, setWaiving] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/groups/${groupId}/class-payments`)
      .then((r) => r.json())
      .then((d) => { setPayments(d?.payments ?? []); setMembers(d?.members ?? []); })
      .catch(() => { setPayments([]); setMembers([]); })
      .finally(() => setLoading(false));
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  const waive = async (paymentId: string) => {
    setWaiving(paymentId);
    try {
      await fetch(`/api/groups/${groupId}/class-payments?paymentId=${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'waive' }),
      });
      load();
    } finally { setWaiving(null); }
  };

  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));

  const statusChip: Record<string, string> = {
    paid: 'bg-brand-soft text-brand-deep',
    due: 'bg-amber-100 text-amber-800',
    overdue: 'bg-coral-soft text-coral',
    waived: 'bg-muted text-muted-foreground',
  };

  const overdueCount = payments.filter((p) => p.status === 'overdue').length;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-ink">Payments</h2>
        {overdueCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-coral-soft text-coral">
            <AlertCircle className="size-3.5" /> {overdueCount} overdue
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><div className="animate-spin h-6 w-6 rounded-full border-b-2 border-brand" /></div>
      ) : payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          No payment records yet. They generate automatically based on the billing model.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-semibold text-ink">Student</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground text-xs">Period / Session</th>
                <th className="px-4 py-3 text-right font-semibold text-ink">Amount</th>
                <th className="px-4 py-3 text-center font-semibold text-ink">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const m = memberById[p.class_member_id];
                const name = (m as any)?.profile?.full_name ?? 'Student';
                return (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-semibold text-ink">{name}</td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                      {p.billing_period ?? (p.session_id ? 'Per session' : '—')}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-ink tabular-nums">TT${Number(p.amount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', statusChip[p.status] ?? 'bg-muted text-muted-foreground')}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(p.status === 'due' || p.status === 'overdue') && (
                        <button onClick={() => waive(p.id)} disabled={waiving === p.id}
                          className="text-xs font-semibold text-muted-foreground hover:text-ink disabled:opacity-40">
                          {waiving === p.id ? '…' : 'Waive'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Settings tab ─────────────────────────────────────────────────────────────

function SettingsTab({ group, setGroup }: { group: GroupWithTutor; setGroup: (g: GroupWithTutor) => void }) {
  const [form, setForm] = useState({
    name: group.name ?? '',
    subject: group.subject ?? '',
    form_level: group.form_level ?? '',
    description: group.description ?? '',
    max_students: group.max_students ?? 20,
    billing_model: (group as any).billing_model ?? 'per_session',
    billing_timing: (group as any).billing_timing ?? null,
    price_per_session: group.price_per_session ?? 0,
    service_fee_pct: (group as any).service_fee_pct ?? 0,
    visibility: (group as any).visibility ?? 'public',
    requires_approval: (group as any).requires_approval ?? false,
    auto_suspend: (group as any).auto_suspend ?? false,
    grace_window_days: (group as any).grace_window_days ?? 7,
    primary_channel: (group as any).primary_channel ?? 'native',
    whatsapp_url: (group as any).whatsapp_url ?? '',
    classroom_url: (group as any).classroom_url ?? '',
    parent_feedback_mode: (group as any).parent_feedback_mode ?? 'off',
    parent_feedback_price: (group as any).parent_feedback_price ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const billingTimingLocked = (group as any).billing_timing != null;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const d = await res.json();
        if (d?.group) setGroup({ ...group, ...d.group });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally { setSaving(false); }
  };

  const archive = async () => {
    if (!confirm('Archive this class? Students will lose access.')) return;
    setArchiving(true);
    try {
      await fetch(`/api/groups/${group.id}/archive`, { method: 'POST' });
      window.location.href = '/tutor/classes';
    } finally { setArchiving(false); }
  };

  const up = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="max-w-2xl space-y-4">
      <SectionCard title="Basics">
        <Field label="Class title"><input value={form.name} onChange={(e) => up({ name: e.target.value })} className={inputCls} /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Subject"><input value={form.subject} onChange={(e) => up({ subject: e.target.value })} className={inputCls} /></Field>
          <Field label="Level / Form"><input value={form.form_level} onChange={(e) => up({ form_level: e.target.value })} className={inputCls} /></Field>
        </div>
        <Field label="Description">
          <textarea value={form.description} onChange={(e) => up({ description: e.target.value })} rows={3} className={cn(inputCls, 'resize-none')} />
        </Field>
      </SectionCard>

      <SectionCard title="Capacity & billing">
        {(group.max_students ?? 1) > 1 && (
          <Field label="Student limit (2–500)">
            <input type="number" min={2} max={500} value={form.max_students}
              onChange={(e) => up({ max_students: Math.min(500, Math.max(2, Number(e.target.value) || 2)) })}
              className={cn(inputCls, 'w-32')} />
          </Field>
        )}
        <Field label="Billing model">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['per_session','per_month','prepaid'] as const).map((m) => (
              <button key={m} onClick={() => up({ billing_model: m })}
                className={cn('flex-1 py-1.5 text-xs font-semibold transition', form.billing_model === m ? 'bg-ink text-white' : 'bg-background text-muted-foreground hover:text-ink')}>
                {m === 'per_session' ? '/session' : m === 'per_month' ? '/month' : 'Prepaid'}
              </button>
            ))}
          </div>
        </Field>
        {form.billing_model === 'per_month' && (
          <Field label={<span className="flex items-center gap-1.5">Billing timing {billingTimingLocked && <span className="text-[10px] font-normal text-muted-foreground">(locked after first save)</span>}</span>}>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['start','end'] as const).map((t) => (
                <button key={t} disabled={billingTimingLocked && form.billing_timing !== t}
                  onClick={() => !billingTimingLocked && up({ billing_timing: t })}
                  className={cn('flex-1 py-1.5 text-xs font-semibold transition', form.billing_timing === t ? 'bg-ink text-white' : 'bg-background text-muted-foreground', billingTimingLocked && form.billing_timing !== t && 'opacity-30 cursor-not-allowed')}>
                  {t === 'start' ? 'Charge at period start' : 'Charge at period end'}
                </button>
              ))}
            </div>
          </Field>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Price (TTD)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">TT$</span>
              <input type="number" value={form.price_per_session} onChange={(e) => up({ price_per_session: Number(e.target.value) })} className={cn(inputCls, 'pl-10')} />
            </div>
          </Field>
          <Field label="Service fee %">
            <input type="number" min={0} max={100} value={form.service_fee_pct} onChange={(e) => up({ service_fee_pct: Number(e.target.value) })} className={inputCls} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Access & policies">
        <Field label="Visibility">
          <div className="flex gap-2">
            {([['public', Globe, 'Public'], ['private', Lock, 'Private']] as const).map(([v, Icon, label]) => (
              <button key={v} onClick={() => up({ visibility: v })}
                className={cn('flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-semibold transition', form.visibility === v ? 'border-brand bg-brand-soft text-brand-deep' : 'border-border text-muted-foreground hover:text-ink')}>
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </Field>
        <ToggleRow label="Require join approval" desc="Students request to join; you approve each one"
          checked={form.requires_approval} onChange={(v) => up({ requires_approval: v })} />
        <ToggleRow label="Auto-suspend on missed payment" desc="Suspends after grace window when overdue"
          checked={form.auto_suspend} onChange={(v) => up({ auto_suspend: v })} />
        {form.auto_suspend && (
          <Field label="Grace window (days)">
            <input type="number" min={0} max={90} value={form.grace_window_days} onChange={(e) => up({ grace_window_days: Number(e.target.value) })} className={cn(inputCls, 'w-24')} />
          </Field>
        )}
      </SectionCard>

      <SectionCard title="Communication">
        <Field label="Primary channel">
          <div className="flex gap-2">
            {(['native','whatsapp','google_classroom'] as const).map((c) => (
              <button key={c} onClick={() => up({ primary_channel: c })}
                className={cn('flex-1 py-1.5 text-xs font-semibold rounded-lg border transition', form.primary_channel === c ? 'border-brand bg-brand-soft text-brand-deep' : 'border-border text-muted-foreground hover:text-ink')}>
                {c === 'native' ? 'iTutor' : c === 'whatsapp' ? 'WhatsApp' : 'Classroom'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="WhatsApp group link"><input value={form.whatsapp_url} onChange={(e) => up({ whatsapp_url: e.target.value })} placeholder="https://chat.whatsapp.com/…" className={inputCls} /></Field>
        <Field label="Google Classroom link"><input value={form.classroom_url} onChange={(e) => up({ classroom_url: e.target.value })} placeholder="https://classroom.google.com/…" className={inputCls} /></Field>
      </SectionCard>

      <SectionCard title="Parent feedback">
        <Field label="Mode">
          <div className="flex gap-2">
            {([['off','Off'],['included','Included free'],['paid','Paid add-on']] as const).map(([v, label]) => (
              <button key={v} onClick={() => up({ parent_feedback_mode: v })}
                className={cn('flex-1 py-1.5 text-xs font-semibold rounded-lg border transition', form.parent_feedback_mode === v ? 'border-brand bg-brand-soft text-brand-deep' : 'border-border text-muted-foreground hover:text-ink')}>
                {label}
              </button>
            ))}
          </div>
        </Field>
        {form.parent_feedback_mode === 'paid' && (
          <Field label="Price per report (TTD)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">TT$</span>
              <input type="number" value={form.parent_feedback_price} onChange={(e) => up({ parent_feedback_price: Number(e.target.value) })} className={cn(inputCls, 'pl-10 w-36')} />
            </div>
          </Field>
        )}
      </SectionCard>

      <div className="rounded-2xl border border-coral/30 bg-background p-5 space-y-3">
        <h3 className="font-bold text-coral text-sm uppercase tracking-wider">Danger zone</h3>
        <button onClick={archive} disabled={archiving}
          className="text-xs font-semibold px-3 py-2 rounded-lg border border-coral text-coral hover:bg-coral-soft disabled:opacity-40">
          {archiving ? 'Archiving…' : 'Archive this class'}
        </button>
      </div>

      <button onClick={save} disabled={saving}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white font-semibold text-sm hover:bg-brand-deep disabled:opacity-40">
        {saved ? <><Check className="size-4" /> Saved!</> : saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}

// ─── Analytics tab ─────────────────────────────────────────────────────────────

function AnalyticsTab({ groupId }: { groupId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/groups/${groupId}/analytics`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [groupId]);

  if (loading) return <div className="py-10 flex justify-center"><div className="animate-spin h-6 w-6 rounded-full border-b-2 border-brand" /></div>;

  const totalMembers = data?.totalMembers ?? data?.approvedMembers?.length ?? 0;
  const attendanceRate = data?.attendanceRate ?? null;
  const retentionRate = data?.retentionRate ?? null;
  const recentAttendance: number[] = data?.recentAttendance ?? [];

  return (
    <div className="max-w-2xl space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Active members" value={String(totalMembers)} />
        {attendanceRate != null && <KpiCard label="Avg attendance" value={`${Math.round(attendanceRate)}%`} />}
        {retentionRate != null && <KpiCard label="Retention" value={`${Math.round(retentionRate)}%`} />}
      </div>

      {recentAttendance.length > 0 && (
        <div className="rounded-2xl border border-border bg-background p-5 space-y-3">
          <h3 className="font-bold text-ink text-sm">Attendance (last {recentAttendance.length} sessions)</h3>
          <div className="flex items-end gap-3 h-24">
            {recentAttendance.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[10px] text-muted-foreground">{v}%</div>
                <div className="w-full rounded-t-md bg-brand" style={{ height: `${Math.max(4, v)}%` }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {data == null && (
        <div className="text-sm text-muted-foreground py-6 text-center">No analytics data yet.</div>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold text-ink mt-1">{value}</div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 space-y-4">
      <h3 className="font-bold text-ink text-sm uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <button onClick={() => onChange(!checked)}
        className={cn('relative shrink-0 mt-0.5 w-11 h-6 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-muted border border-border')}>
        <span className={cn('absolute top-1 left-1 size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0')} />
      </button>
    </div>
  );
}
