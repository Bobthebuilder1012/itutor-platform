'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Users, UserPlus, Copy, Check, Star,
  Bell, X, Plus, ExternalLink, Trash2, Globe, Eye,
  Video, MoreVertical, Pin, Sparkles, Link as LinkIcon, Paperclip, AlertTriangle, ShieldAlert,
  Mail, MessageSquare, DollarSign, BarChart3, ArrowUp, ArrowDown, Lock,
  Calendar as CalendarIcon, BookOpen, Ban, Repeat, Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useUnsavedGuard } from '@/lib/hooks/useUnsavedGuard';
import { UnsavedBar } from '@/components/UnsavedBar';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';

type DbSubject = { id: string; name: string; label: string; curriculum: string };

const LEVEL_OPTIONS = [
  { value: 'SEA',    label: 'SEA' },
  { value: 'FORM_1', label: 'Form 1' },
  { value: 'FORM_2', label: 'Form 2' },
  { value: 'FORM_3', label: 'Form 3' },
  { value: 'FORM_4', label: 'Form 4' },
  { value: 'FORM_5', label: 'Form 5' },
  { value: 'CAPE',   label: 'CAPE' },
];

type Tab = 'stream' | 'sessions' | 'roster' | 'payments' | 'settings' | 'analytics';

type GroupMember = {
  id: string;
  studentId: string;
  name: string;
  paymentStatus: 'paid' | 'pending' | 'overdue';
  status: 'active' | 'invited' | 'suspended' | 'banned' | 'removed';
  joinedAt: string | null;
  outstandingTtd?: number;
};

type StreamPost = {
  id: string;
  kind: 'announcement' | 'attachment' | 'link' | 'ai-recap';
  title: string;
  body: string;
  at: string;
  pinned?: boolean;
  pendingApproval?: boolean;
  attachmentName?: string;
  linkUrl?: string;
};

type GroupSession = {
  id: string;
  date: string;
  durationMin: number;
  status: 'upcoming' | 'past';
  attendanceStatus?: string;
  paymentStatus?: string;
};

type GroupDetail = {
  id: string;
  title: string;
  subject: string;
  level: string;
  description: string;
  capacity: number;
  enrolled: number;
  pricePerSession: number | null;
  status: string;
  isPublic: boolean;
  thumbnailGradient?: string;
  recurrenceRule?: string;
  videoProvider?: string;
  earningsTtd?: number;
  totalSessionsRun?: number;
  rating?: number | null;
  reviewCount?: number;
  whatsappLink?: string;
};

export default function TutorLessonDetailPage() {
  return (
    <TutorShell>
      <ClassHubContent />
    </TutorShell>
  );
}

function ClassHubContent() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string | undefined;
  const { profile, loading } = useProfile();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [sessions, setSessions] = useState<GroupSession[]>([]);
  const [posts, setPosts] = useState<StreamPost[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('stream');
  const [settingsDirty, setSettingsDirty] = useState(false);

  const switchTab = (next: Tab) => {
    if (tab === 'settings' && settingsDirty) {
      if (!window.confirm('You have unsaved changes in Settings. Leave anyway?')) return;
      setSettingsDirty(false);
    }
    setTab(next);
  };

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.replace('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!id || !profile?.id) return;
    fetchAll(id);
  }, [id, profile?.id]);

  async function fetchAll(groupId: string) {
    setDataLoading(true);
    try {
      // Fetch group directly — more reliable than API route
      const { data: g } = await supabase.from('groups').select('*').eq('id', groupId).single();
      if (g) {
        setGroup({
          id: g.id,
          title: g.name || 'Untitled class',
          subject: g.subject || '—',
          level: g.form_level || '—',
          description: g.description || '',
          capacity: g.max_students ?? 20,
          enrolled: 0,
          pricePerSession: g.price_per_session ?? null,
          status: g.status ?? 'DRAFT',
          isPublic: ['PUBLISHED', 'published'].includes(g.status ?? ''),
          recurrenceRule: g.recurrence_rule,
          earningsTtd: 0,
          totalSessionsRun: 0,
          whatsappLink: g.whatsapp_link ?? '',
          rating: null,
          reviewCount: 0,
        });
      }

      // Fetch members — no embed to avoid PostgREST relationship ambiguity
      let rawMembers: any[] = [];
      const { data: mBare } = await supabase
        .from('group_members')
        .select('id, user_id, status, joined_at')
        .eq('group_id', groupId);
      rawMembers = mBare ?? [];
      // Fetch display names for members
      const userIds = rawMembers.map((m: any) => m.user_id).filter(Boolean);
      const nameMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, display_name')
          .in('id', userIds);
        for (const p of profiles ?? []) {
          nameMap[p.id] = p.full_name || p.display_name || 'Student';
        }
      }
      setMembers(rawMembers.map((m: any): GroupMember => ({
        id: m.id,
        studentId: m.user_id,
        name: (m.profile as any)?.full_name ?? nameMap[m.user_id] ?? 'Student',
        paymentStatus: 'pending',
        status: m.status === 'approved' ? 'active' : (m.status ?? 'active'),
        joinedAt: m.joined_at ?? null,
      })));
      if (g) setGroup((prev) => prev ? { ...prev, enrolled: rawMembers.filter((m: any) => m.status === 'approved').length } : prev);

      // Fetch sessions via API (it handles occurrences)
      try {
        const sRes = await fetch(`/api/groups/${groupId}/sessions`);
        if (sRes.ok) {
          const sJson = await sRes.json();
          setSessions((sJson.sessions ?? []).flatMap((s: any): GroupSession[] => {
            const durationMin = s.duration_minutes ?? s.duration_min ?? s.duration ?? 60;
            // If occurrences exist, use them as individual entries
            const occs: any[] = s.occurrences ?? [];
            if (occs.length > 0) {
              return occs.map((o: any) => {
                const dt = o.scheduled_start_at ?? o.scheduled_at;
                return {
                  id: o.id ?? s.id,
                  date: dt,
                  durationMin,
                  status: dt && new Date(dt) > new Date() ? 'upcoming' : 'past',
                  attendanceStatus: o.attendance_status,
                  paymentStatus: o.payment_status,
                };
              });
            }
            // Fallback: build datetime from starts_on + start_time
            const dateStr = s.starts_on ?? s.date;
            const timeStr = s.start_time ?? '00:00';
            const dt = dateStr ? `${dateStr}T${timeStr}:00` : null;
            return [{
              id: s.id,
              date: dt ?? new Date().toISOString(),
              durationMin,
              status: dt && new Date(dt) > new Date() ? 'upcoming' : 'past',
              attendanceStatus: s.attendance_status,
              paymentStatus: s.payment_status,
            }];
          }));
        }
      } catch { /* sessions non-critical */ }

      // Fetch stream posts via API
      try {
        const pRes = await fetch(`/api/groups/${groupId}/stream`);
        if (pRes.ok) {
          const pJson = await pRes.json();
          setPosts((pJson.posts ?? []).map((p: any): StreamPost => ({
            id: p.id,
            kind: p.kind ?? p.type ?? 'announcement',
            title: p.title ?? p.content?.slice(0, 60) ?? '',
            body: p.body ?? p.content ?? '',
            at: formatRelative(p.created_at),
            pinned: p.is_pinned ?? p.pinned ?? false,
            pendingApproval: p.pending_approval ?? false,
            attachmentName: p.attachment_name,
            linkUrl: p.link_url,
          })));
        }
      } catch { /* stream non-critical */ }

    } catch {
      // keep empty state
    } finally {
      setDataLoading(false);
    }
  }

  if (loading || dataLoading || !group) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  const isOneOnOne = group.capacity === 1;
  const enrolledCount = members.filter((m) => m.status !== 'removed').length;
  const atCapacity = enrolledCount >= group.capacity;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'stream', label: 'Stream' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'roster', label: 'Roster' },
    { key: 'payments', label: 'Payments' },
    { key: 'settings', label: 'Settings' },
    ...(isOneOnOne ? [] : [{ key: 'analytics' as Tab, label: 'Analytics' }]),
  ];

  return (
    <div className="-mx-4 lg:-mx-8 -mt-6 lg:-mt-8">
      {/* Banner header */}
      <div className={cn('relative h-44 lg:h-52 bg-gradient-to-br', group.thumbnailGradient ?? 'from-brand to-emerald-400')}>
        <Link href="/tutor/classes" className="absolute top-4 left-4 inline-flex items-center gap-1 text-xs font-semibold text-white/95 bg-black/30 hover:bg-black/40 px-3 py-1.5 rounded-full backdrop-blur">
          <ArrowLeft className="size-3.5" /> All Classes
        </Link>
        <div className="absolute inset-x-0 bottom-0">
          <div className="px-4 lg:px-8 pb-5 text-white flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/90 text-ink">
                  {isOneOnOne ? '1:1' : 'Group'}
                </span>
                <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 border border-white/30 inline-flex items-center gap-1')}>
                  {group.isPublic ? <Globe className="size-3" /> : <Lock className="size-3" />}
                  {group.isPublic ? 'public' : 'private'}
                </span>
                {atCapacity && !isOneOnOne && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500 text-white">At capacity</span>
                )}
              </div>
              <h1 className="mt-2 text-2xl lg:text-3xl font-bold truncate">{group.title}</h1>
              <div className="mt-1 text-sm text-white/85">{group.subject} · {group.level}{group.recurrenceRule ? ` · ${group.recurrenceRule}` : ''}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/95 text-ink px-4 py-2 text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">per session</div>
                <div className="text-lg font-bold">TTD {group.pricePerSession ?? 0}</div>
              </div>
              {!isOneOnOne && (
                <div className="rounded-xl bg-white/95 text-ink px-4 py-2 text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Members</div>
                  <div className="text-lg font-bold tabular-nums">{enrolledCount}/{group.capacity}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-8 pb-12">
        <div className="border-b border-border mt-6 flex items-center gap-6 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={cn('relative pb-3 text-sm font-semibold capitalize whitespace-nowrap transition',
                tab === t.key ? 'text-brand-deep' : 'text-muted-foreground hover:text-ink')}>
              {t.label}
              {tab === t.key && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-brand" />}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === 'stream'    && <StreamTab group={group} posts={posts} setPosts={setPosts} />}
          {tab === 'sessions'  && <SessionsTab sessions={sessions} groupId={group.id} setSessions={setSessions} />}
          {tab === 'roster'    && <RosterTab members={members} setMembers={setMembers} group={group} isOneOnOne={isOneOnOne} atCapacity={atCapacity} />}
          {tab === 'payments'  && <PaymentsTab members={members} group={group} />}
          {tab === 'settings'  && <SettingsTab group={group} setGroup={setGroup} isOneOnOne={isOneOnOne} onDirtyChange={setSettingsDirty} />}
          {tab === 'analytics' && !isOneOnOne && <AnalyticsTab group={group} members={members} />}
        </div>
      </div>
    </div>
  );
}

/* ----------- Stream ----------- */
function StreamTab({ group, posts, setPosts }: { group: GroupDetail; posts: StreamPost[]; setPosts: React.Dispatch<React.SetStateAction<StreamPost[]>> }) {
  const [composer, setComposer] = useState<null | StreamPost['kind']>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const sorted = [...posts].sort((a, b) => (a.pinned ? -1 : 0) - (b.pinned ? -1 : 0));

  const submit = async () => {
    if (!title.trim()) return;
    try {
      const res = await fetch(`/api/groups/${group.id}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: composer, title, body }),
      });
      const json = await res.json();
      const p = json.post ?? { id: `tmp-${Date.now()}`, kind: composer!, title, body, at: 'Just now' };
      setPosts([{ ...p, at: 'Just now' }, ...posts]);
    } catch {
      setPosts([{ id: `tmp-${Date.now()}`, kind: composer!, title, body, at: 'Just now' }, ...posts]);
    }
    setTitle(''); setBody(''); setComposer(null);
  };

  const togglePin = (id: string) => setPosts(posts.map((p) => p.id === id ? { ...p, pinned: !p.pinned } : p));
  const remove = (id: string) => setPosts(posts.filter((p) => p.id !== id));

  return (
    <div className="grid lg:grid-cols-[1fr,280px] gap-6">
      <div className="space-y-4">
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Post to your class</div>
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { kind: 'announcement' as const, color: 'amber', label: 'Announcement', icon: Bell },
              { kind: 'attachment' as const, color: 'violet', label: 'File attachment', icon: Paperclip },
              { kind: 'link' as const, color: 'sky', label: 'Link', icon: LinkIcon },
              { kind: 'ai-recap' as const, color: 'emerald', label: 'AI recap', icon: Sparkles },
            ]).map(({ kind, color, label, icon: Icon }) => (
              <button key={kind} onClick={() => setComposer(kind)}
                className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border',
                  {
                    amber:   'bg-amber-50 text-amber-700 border-amber-200',
                    violet:  'bg-violet-50 text-violet-700 border-violet-200',
                    sky:     'bg-sky-50 text-sky-700 border-sky-200',
                    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                  }[color],
                  composer === kind && 'ring-2 ring-brand')}>
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
          {composer && (
            <div className="space-y-2 pt-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message to your students…"
                className="w-full min-h-24 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              <div className="flex justify-end gap-2">
                <button onClick={() => { setComposer(null); setTitle(''); setBody(''); }} className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted">Cancel</button>
                <button onClick={submit} className="px-4 py-1.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90">Post</button>
              </div>
            </div>
          )}
        </div>

        {sorted.length === 0 && <EmptyState icon={Bell} title="No posts yet" body="Start the conversation with an announcement or share a file." />}
        {sorted.map((p) => <StreamCard key={p.id} post={p} onPin={() => togglePin(p.id)} onRemove={() => remove(p.id)} />)}
      </div>

      <aside className="space-y-4">
        <SideCard title="Class info">
          <InfoRow label="Subject" value={`${group.subject} · ${group.level}`} />
          <InfoRow label="Video" value={group.videoProvider ?? '—'} />
          <InfoRow label="Status" value={group.status} />
        </SideCard>
        <SideCard title="Pinned">
          <ul className="space-y-2 text-sm">
            {sorted.filter((p) => p.pinned).map((p) => (
              <li key={p.id} className="flex items-start gap-2">
                <Pin className="size-3.5 text-rose-400 mt-0.5" />
                <span className="text-ink line-clamp-2">{p.title}</span>
              </li>
            ))}
            {sorted.filter((p) => p.pinned).length === 0 && <li className="text-xs text-muted-foreground">Nothing pinned yet.</li>}
          </ul>
        </SideCard>
      </aside>
    </div>
  );
}

function StreamCard({ post, onPin, onRemove }: { post: StreamPost; onPin: () => void; onRemove: () => void }) {
  const meta: Record<StreamPost['kind'], { icon: any; cls: string; tag: string }> = {
    announcement: { icon: Bell,      cls: 'bg-amber-100 text-amber-700',   tag: 'Announcement' },
    attachment:   { icon: Paperclip, cls: 'bg-violet-100 text-violet-700', tag: 'Attachment' },
    link:         { icon: LinkIcon,  cls: 'bg-sky-100 text-sky-700',       tag: 'Link' },
    'ai-recap':   { icon: Sparkles,  cls: 'bg-emerald-100 text-emerald-700', tag: 'AI Recap' },
  };
  const M = meta[post.kind];
  const Icon = M.icon;
  return (
    <div className={cn('rounded-2xl bg-card border p-5', post.pinned ? 'border-rose-200 ring-1 ring-rose-100' : 'border-border')}>
      <div className="flex items-start gap-3">
        <div className={cn('size-10 rounded-xl grid place-items-center shrink-0', M.cls)}><Icon className="size-4" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{M.tag}</span>
            {post.pinned && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-100 text-rose-600">Pinned</span>}
          </div>
          <div className="mt-1 font-semibold text-ink">{post.title}</div>
          <p className="text-sm text-muted-foreground mt-1">{post.body}</p>
          {post.attachmentName && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-xs font-semibold">
              <Paperclip className="size-3.5" /> {post.attachmentName}
            </div>
          )}
          {post.linkUrl && (
            <a href={post.linkUrl} target="_blank" rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-xs font-semibold text-brand-deep hover:bg-brand/5">
              <ExternalLink className="size-3.5" /> {post.linkUrl}
            </a>
          )}
          <div className="mt-3 flex items-center justify-between">
            <div className="text-[11px] text-muted-foreground">{post.at}</div>
            <div className="flex items-center gap-1">
              <button onClick={onPin} className="size-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground" title={post.pinned ? 'Unpin' : 'Pin'}>
                <Pin className={cn('size-3.5', post.pinned && 'fill-rose-400 text-rose-400')} />
              </button>
              <button onClick={onRemove} className="size-7 grid place-items-center rounded-md hover:bg-rose-50 text-rose-500" title="Delete">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------- Sessions ----------- */
type Recurrence = 'none' | 'daily' | 'weekly';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2), m = i % 2 === 0 ? '00' : '30';
  const value = `${String(h).padStart(2, '0')}:${m}`;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const label = `${h12}:${m} ${period}`;
  return { value, label };
});

function SessionsTab({ sessions, groupId, setSessions }: { sessions: GroupSession[]; groupId: string; setSessions: React.Dispatch<React.SetStateAction<GroupSession[]>> }) {
  const upcoming = sessions.filter((s) => s.status === 'upcoming');
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const blankForm = () => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      date: tomorrow.toISOString().slice(0, 10),
      time: '16:00',
      duration: 60,
      recurrence: 'none' as Recurrence,
      weekdays: [tomorrow.getDay()],
      endDate: '',
      notes: '',
    };
  };
  const [form, setForm] = useState(blankForm);

  const buildOccurrences = (): Date[] => {
    if (!form.date) return [];
    const [hh, mm] = form.time.split(':').map(Number);
    const start = new Date(`${form.date}T${form.time}`);
    if (form.recurrence === 'none') return [start];
    const horizon = form.endDate ? new Date(`${form.endDate}T23:59:59`) : (() => { const d = new Date(start); d.setMonth(d.getMonth() + 3); return d; })();
    const out: Date[] = [];
    const cursor = new Date(start);
    while (cursor <= horizon && out.length < 60) {
      if (form.recurrence === 'daily') { out.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }
      else { if (form.weekdays.includes(cursor.getDay())) out.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }
    }
    return out;
  };
  const occurrences = buildOccurrences();

  const createSession = async () => {
    if (!form.date) return;
    setSaving(true);
    try {
      // The API expects a single session record with recurrence info —
      // it generates all occurrences server-side.
      const title = `Session — ${new Date(form.date + 'T' + form.time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
      const payload = {
        title,
        start_time: form.time,             // "HH:MM"
        starts_on: form.date,              // "YYYY-MM-DD"
        ends_on: form.endDate || null,
        duration_minutes: form.duration,
        recurrence_type: form.recurrence,  // "none" | "daily" | "weekly"
        recurrence_days: form.recurrence === 'weekly' ? form.weekdays : [],
        timezone_offset: -new Date().getTimezoneOffset(), // minutes from UTC
      };

      const res = await fetch(`/api/groups/${groupId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`);

      // Add occurrences returned by the server to local state
      const serverOccs: GroupSession[] = (json.session?.occurrences ?? occurrences.map((d) => ({ scheduled_start_at: d.toISOString() }))).map((o: any) => ({
        id: o.id ?? `tmp-${Date.now()}-${Math.random()}`,
        date: o.scheduled_start_at ?? o,
        durationMin: form.duration,
        status: 'upcoming' as const,
      }));
      setSessions((prev) => [...prev, ...serverOccs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
      setAddOpen(false);
      setForm(blankForm());
    } catch (e: any) {
      alert(e?.message ?? 'Failed to create session');
    } finally {
      setSaving(false);
    }
  };

  const toggleWeekday = (i: number) =>
    setForm((f) => ({ ...f, weekdays: f.weekdays.includes(i) ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i].sort() }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Sessions</h2>
          <p className="text-xs text-muted-foreground">{upcoming.length} upcoming · manage attendance and join links.</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90">
          <Plus className="size-3.5" /> Add Session
        </button>
      </div>

      {/* Add Session Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setAddOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-background shadow-xl border border-border max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
              <div><div className="font-bold text-ink">Add session</div><div className="text-xs text-muted-foreground mt-0.5">Students will see this on their calendar</div></div>
              <button onClick={() => setAddOpen(false)} className="size-8 grid place-items-center rounded-lg hover:bg-muted"><X className="size-4" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Date + time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Date</label>
                  <input type="date" value={form.date} min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Start time</label>
                  <div className="mt-1 relative">
                    <Clock className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand appearance-none">
                      {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Duration</label>
                <div className="mt-1 flex gap-2 flex-wrap">
                  {[30, 60, 90, 120, 180, 300].map((d) => (
                    <button key={d} onClick={() => setForm({ ...form, duration: d })}
                      className={cn('px-3 py-1.5 rounded-lg border text-xs font-semibold',
                        form.duration === d ? 'bg-brand/10 border-brand text-brand-deep' : 'border-border bg-background text-muted-foreground hover:text-ink')}>
                      {d < 60 ? `${d} min` : d % 60 === 0 ? `${d / 60} hr` : `${Math.floor(d / 60)}h ${d % 60}m`}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => setForm((f) => ({ ...f, duration: Math.max(15, f.duration - 15) }))}
                    className="size-8 grid place-items-center rounded-lg border border-border hover:bg-muted text-sm font-bold">−</button>
                  <div className="text-sm font-semibold text-ink w-20 text-center">
                    {form.duration < 60 ? `${form.duration} min` : form.duration % 60 === 0 ? `${form.duration / 60} hr` : `${Math.floor(form.duration / 60)}h ${form.duration % 60}m`}
                  </div>
                  <button onClick={() => setForm((f) => ({ ...f, duration: Math.min(300, f.duration + 15) }))}
                    className="size-8 grid place-items-center rounded-lg border border-border hover:bg-muted text-sm font-bold">+</button>
                  <span className="text-xs text-muted-foreground">15 min steps · max 5 hr</span>
                </div>
              </div>

              {/* Recurrence */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5"><Repeat className="size-3.5" /> Recurrence</label>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {(['none', 'daily', 'weekly'] as Recurrence[]).map((r) => (
                    <button key={r} onClick={() => setForm({ ...form, recurrence: r })}
                      className={cn('px-3 py-2 rounded-lg border text-xs font-semibold capitalize',
                        form.recurrence === r ? 'bg-brand/10 border-brand text-brand-deep' : 'border-border bg-background text-muted-foreground hover:text-ink')}>
                      {r === 'none' ? 'One-off' : r}
                    </button>
                  ))}
                </div>
              </div>

              {form.recurrence === 'weekly' && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Repeat on</label>
                  <div className="mt-1 flex gap-1.5 flex-wrap">
                    {WEEKDAYS.map((w, i) => (
                      <button key={w} onClick={() => toggleWeekday(i)}
                        className={cn('size-10 rounded-lg border text-xs font-semibold',
                          form.weekdays.includes(i) ? 'bg-brand text-white border-brand' : 'border-border bg-background text-muted-foreground hover:text-ink')}>
                        {w[0]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {form.recurrence !== 'none' && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">End date <span className="font-normal lowercase opacity-70">(optional · default 3 months)</span></label>
                  <input type="date" value={form.endDate} min={form.date}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes (optional)</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Topic, prep, anything students should know…"
                  className="mt-1 w-full min-h-20 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>

              {/* Preview */}
              {form.recurrence !== 'none' && occurrences.length > 0 && (
                <div className="rounded-lg bg-brand/5 border border-brand/20 px-3 py-2 text-xs text-brand-deep">
                  Will create <strong>{occurrences.length}</strong> session{occurrences.length !== 1 ? 's' : ''} between{' '}
                  <strong>{format(occurrences[0], 'MMM d')}</strong> and <strong>{format(occurrences[occurrences.length - 1], 'MMM d, yyyy')}</strong>.
                </div>
              )}

              <div className="rounded-lg bg-muted/40 border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-2">
                <Video className="size-3.5 mt-0.5 shrink-0 text-brand-deep" />
                Meeting links are auto-generated from your connected video provider when each session goes live.
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end gap-2 shrink-0">
              <button onClick={() => setAddOpen(false)} className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={createSession} disabled={!form.date || saving}
                className="px-4 py-1.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-50">
                {saving ? 'Saving…' : form.recurrence === 'none' ? 'Add session' : `Add ${occurrences.length} session${occurrences.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
        <Video className="size-3.5 mt-0.5 shrink-0 text-brand-deep" />
        Meeting links are generated automatically from your video provider — no manual setup per session.
      </div>
      {sessions.length === 0 && <EmptyState icon={CalendarIcon} title="No sessions scheduled" body="Add your first session to publish a calendar entry to enrolled students." />}
      <div className="space-y-3">
        {sessions.map((s) => {
          const d = new Date(s.date);
          const valid = !isNaN(d.getTime());
          const future = valid && d > new Date();
          const durationMin = s.durationMin ?? 60;
          const durLabel = durationMin < 60 ? `${durationMin}m` : durationMin % 60 === 0 ? `${durationMin / 60}hr` : `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;
          return (
            <div key={s.id} className="rounded-2xl bg-card border border-border p-4 flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-center gap-3 md:w-64">
                <div className="text-center bg-brand/10 text-brand-deep rounded-lg px-3 py-1.5 leading-tight">
                  <div className="text-base font-bold">{valid ? d.getDate() : '—'}</div>
                  <div className="text-[9px] uppercase font-bold tracking-wider">{valid ? d.toLocaleString(undefined, { month: 'short' }) : '—'}</div>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-ink text-sm truncate">
                    {valid ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Scheduled'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {valid ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}{valid ? ' · ' : ''}{durLabel}
                  </div>
                </div>
              </div>
              <div className="flex flex-1 items-center gap-2 flex-wrap">
                <Pill tone={s.attendanceStatus === 'attended' ? 'emerald' : s.attendanceStatus === 'no-show' ? 'rose' : 'slate'}
                  label={`Attendance: ${s.attendanceStatus ?? (future ? '—' : 'pending')}`} />
                <Pill tone={s.paymentStatus === 'paid' ? 'emerald' : s.paymentStatus === 'overdue' ? 'rose' : 'amber'}
                  label={`Payment: ${s.paymentStatus ?? 'pending'}`} />
              </div>
              {future && (
                <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90">
                  <Video className="size-3.5" /> Join
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------- Roster ----------- */
function RosterTab({ members, setMembers, group, isOneOnOne, atCapacity }: {
  members: GroupMember[]; setMembers: React.Dispatch<React.SetStateAction<GroupMember[]>>;
  group: GroupDetail; isOneOnOne: boolean; atCapacity: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState<null | 'link' | 'user'>(null);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteOk, setInviteOk] = useState('');
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/classes/${group.id}` : '';

  const updateMember = (sid: string, patch: Partial<GroupMember>) =>
    setMembers((ms) => ms.map((m) => m.studentId === sid ? { ...m, ...patch } : m));

  const copy = () => { navigator.clipboard?.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const sendInvite = async () => {
    if (!inviteQuery.trim() || inviteSending) return;
    setInviteSending(true); setInviteError(''); setInviteOk('');
    try {
      const res = await fetch(`/api/groups/${group.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteQuery.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`);
      const name = json.profile?.full_name ?? inviteQuery.trim();
      setInviteOk(`${name} added successfully!`);
      setInviteQuery('');
      // Add to local roster if not already present
      if (json.member?.user_id) {
        setMembers((ms) => {
          if (ms.find((m) => m.studentId === json.member.user_id)) return ms;
          const newMember: GroupMember = {
            id: json.member.id ?? json.member.user_id,
            studentId: json.member.user_id,
            name: json.profile?.full_name ?? inviteQuery.trim(),
            status: 'active',
            paymentStatus: 'pending',
            joinedAt: json.member.joined_at ?? new Date().toISOString(),
          };
          return [...ms, newMember];
        });
      }
    } catch (e: any) {
      setInviteError(e?.message ?? 'Failed to send invite');
    } finally {
      setInviteSending(false);
    }
  };
  const visible = members.filter((m) => m.status !== 'removed');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Roster</h2>
          <p className="text-xs text-muted-foreground">
            {isOneOnOne ? '1:1 — your recurring student.' : `${visible.length} of ${group.capacity} seats filled.`}
          </p>
        </div>
        {!isOneOnOne && (
          <div className="flex items-center gap-2">
            <button disabled={atCapacity} onClick={() => setInviteOpen('link')}
              className={cn('inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold',
                atCapacity ? 'border-border text-muted-foreground cursor-not-allowed' : 'border-border bg-background hover:bg-muted')}>
              <LinkIcon className="size-3.5" /> Invite by Link
            </button>
            <button disabled={atCapacity} onClick={() => setInviteOpen('user')}
              className={cn('inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold',
                atCapacity ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-brand text-white hover:bg-brand/90')}>
              <UserPlus className="size-3.5" /> Invite by User
            </button>
          </div>
        )}
      </div>

      {atCapacity && (
        <Banner tone="rose" icon={ShieldAlert} title="Class is at capacity"
          body="New invites are paused. Increase max class size in Settings or wait for a member to leave." />
      )}

      {inviteOpen === 'link' && (
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <div className="font-semibold text-ink">Invite link</div>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <span className="text-xs text-muted-foreground truncate font-mono flex-1">{inviteUrl}</span>
            <button onClick={copy} className="text-xs font-semibold text-brand-deep hover:underline inline-flex items-center gap-1">
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {inviteOpen === 'user' && (
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <div className="font-semibold text-ink">Invite by username or email</div>
          <div className="flex items-center gap-2">
            <input
              value={inviteQuery}
              onChange={(e) => { setInviteQuery(e.target.value); setInviteError(''); setInviteOk(''); }}
              onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
              placeholder="e.g. student@example.tt"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            <button
              onClick={sendInvite}
              disabled={inviteSending || !inviteQuery.trim()}
              className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 inline-flex items-center gap-1.5 disabled:opacity-50">
              <Mail className="size-3.5" /> {inviteSending ? 'Sending…' : 'Send invite'}
            </button>
          </div>
          {inviteError && <p className="text-xs text-red-500">{inviteError}</p>}
          {inviteOk && <p className="text-xs text-emerald-600 font-medium">{inviteOk}</p>}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState icon={Users} title="No members yet" body="Invite by link or by user to start filling this class." />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-bold px-4 py-2">Member</th>
                <th className="text-left font-bold px-4 py-2">Status</th>
                <th className="text-left font-bold px-4 py-2">Payment</th>
                <th className="text-left font-bold px-4 py-2">Joined</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((m) => (
                <RosterRow key={m.studentId} m={m} onUpdate={(p) => updateMember(m.studentId, p)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RosterRow({ m, onUpdate }: { m: GroupMember; onUpdate: (p: Partial<GroupMember>) => void }) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<null | 'suspend' | 'ban' | 'remove'>(null);
  const statusMeta: Record<string, { label: string; chip: string }> = {
    invited:   { label: 'Invited',   chip: 'bg-sky-100 text-sky-700 border-sky-200' },
    active:    { label: 'Active',    chip: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    suspended: { label: 'Suspended', chip: 'bg-amber-100 text-amber-800 border-amber-200' },
    banned:    { label: 'Banned',    chip: 'bg-rose-100 text-rose-700 border-rose-200' },
    removed:   { label: 'Removed',   chip: 'bg-muted text-muted-foreground border-border' },
  };
  const sm = statusMeta[m.status] ?? statusMeta.active;

  const confirmCopy = {
    suspend: {
      title: `Suspend ${m.name}?`,
      body: `${m.name} will lose access to the stream, sessions, and meeting links until you reactivate them.`,
      action: 'Suspend', tone: 'amber',
      run: () => { onUpdate({ status: 'suspended' }); },
    },
    ban: {
      title: `Ban ${m.name} from this class?`,
      body: `${m.name} will be permanently removed and blocked from rejoining. This cannot be undone.`,
      action: 'Ban from class', tone: 'rose',
      run: () => { onUpdate({ status: 'banned' }); },
    },
    remove: {
      title: `Remove ${m.name} from this class?`,
      body: `${m.name} will lose access immediately. They can be re-invited later.`,
      action: 'Remove', tone: 'rose',
      run: () => { onUpdate({ status: 'removed' }); },
    },
  };
  const conf = confirm ? confirmCopy[confirm] : null;

  return (
    <>
      <tr className={cn(m.status === 'suspended' && 'bg-amber-50/40', m.status === 'banned' && 'bg-rose-50/40', m.status === 'removed' && 'opacity-60')}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-full bg-gradient-to-br from-brand to-emerald-400 grid place-items-center text-xs font-bold text-white">
              {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <div className="font-semibold text-ink">{m.name}</div>
              {m.paymentStatus === 'overdue' && <div className="text-[11px] text-rose-600 font-semibold">Outstanding TTD {m.outstandingTtd ?? 0}</div>}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border', sm.chip)}>{sm.label}</span>
        </td>
        <td className="px-4 py-3">
          <Pill tone={m.paymentStatus === 'paid' ? 'emerald' : m.paymentStatus === 'overdue' ? 'rose' : 'amber'} label={m.paymentStatus} />
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
        </td>
        <td className="px-4 py-3 text-right relative">
          <button onClick={() => setMenu(!menu)} className="size-8 grid place-items-center rounded-md hover:bg-muted text-muted-foreground">
            <MoreVertical className="size-4" />
          </button>
          {menu && (
            <div className="absolute right-4 top-10 z-10 w-56 rounded-xl border border-border bg-background shadow-lg p-1 text-left">
              {m.status !== 'suspended' && m.status !== 'banned'
                ? <MenuBtn icon={ShieldAlert} label="Suspend" onClick={() => { setMenu(false); setConfirm('suspend'); }} />
                : m.status === 'suspended'
                ? <MenuBtn icon={Check} label="Reactivate" onClick={() => { onUpdate({ status: 'active' }); setMenu(false); }} />
                : null}
              <MenuBtn icon={AlertTriangle} label="Send warning" onClick={() => setMenu(false)} />
              {m.status !== 'banned' && <MenuBtn icon={Ban} destructive label="Ban from class" onClick={() => { setMenu(false); setConfirm('ban'); }} />}
              <MenuBtn icon={Trash2} destructive label="Remove from class" onClick={() => { setMenu(false); setConfirm('remove'); }} />
            </div>
          )}
        </td>
      </tr>

      {/* Confirm dialog */}
      {confirm && conf && (
        <tr><td colSpan={5} className="p-0">
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setConfirm(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-background border border-border shadow-xl p-6 space-y-4">
              <div className="font-bold text-ink text-lg">{conf.title}</div>
              <p className="text-sm text-muted-foreground">{conf.body}</p>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setConfirm(null)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted">Cancel</button>
                <button onClick={() => { conf.run(); setConfirm(null); }}
                  className={cn('px-4 py-2 rounded-xl text-white text-sm font-semibold',
                    conf.tone === 'rose' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700')}>
                  {conf.action}
                </button>
              </div>
            </div>
          </div>
        </td></tr>
      )}
    </>
  );
}

/* ----------- Payments ----------- */
const PAYMENT_PERIODS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'] as const;

function PaymentsTab({ members, group }: { members: GroupMember[]; group: GroupDetail }) {
  const visible = members.filter((m) => m.status !== 'removed');
  const outstanding = members.reduce((s, m) => s + (m.paymentStatus === 'overdue' ? (m.outstandingTtd ?? 0) : 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Payments</h2>
          <p className="text-xs text-muted-foreground">Track every member × period in one grid.</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-2 text-sm">
          <span className="text-emerald-700 font-bold">Collected TTD {(group.earningsTtd ?? 0).toLocaleString()}</span>
          <span className="text-muted-foreground mx-2">vs</span>
          <span className={cn('font-bold', outstanding > 0 ? 'text-rose-700' : 'text-muted-foreground')}>
            Outstanding TTD {outstanding.toLocaleString()}
          </span>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={DollarSign} title="No members to bill" body="Once members join, you'll see a status chip per period here." />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-bold px-4 py-2 sticky left-0 bg-muted/40">Member</th>
                {PAYMENT_PERIODS.map((c) => <th key={c} className="text-center font-bold px-3 py-2">{c}</th>)}
                <th className="text-right font-bold px-4 py-2">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((m) => (
                <tr key={m.studentId}>
                  <td className="px-4 py-3 sticky left-0 bg-card">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-full bg-gradient-to-br from-brand to-emerald-400 grid place-items-center text-[10px] font-bold text-white">
                        {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </div>
                      <span className="font-semibold text-ink">{m.name}</span>
                    </div>
                  </td>
                  {PAYMENT_PERIODS.map((_, pi) => {
                    const seed = (members.indexOf(m) * 7 + pi * 3) % 11;
                    const status = m.paymentStatus === 'overdue' && pi >= PAYMENT_PERIODS.length - 2 ? 'overdue'
                      : m.paymentStatus === 'pending' && pi === PAYMENT_PERIODS.length - 1 ? 'due'
                      : seed === 0 ? 'waived' : 'paid';
                    const chip = status === 'paid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : status === 'due' ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : status === 'overdue' ? 'bg-rose-100 text-rose-700 border-rose-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200';
                    return (
                      <td key={pi} className="px-2 py-2 text-center">
                        <span className={cn('inline-block px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider', chip)}>
                          {status === 'paid' ? 'Paid' : status === 'due' ? 'Due' : status === 'overdue' ? 'Overdue' : 'Waived'}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {m.paymentStatus === 'overdue' ? <span className="text-rose-600">TTD {(m.outstandingTtd ?? 0).toLocaleString()}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ----------- Settings ----------- */
function SettingsTab({ group, setGroup, isOneOnOne, onDirtyChange }: {
  group: GroupDetail;
  setGroup: React.Dispatch<React.SetStateAction<GroupDetail | null>>;
  isOneOnOne: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const gradients = [
    'from-orange-500 to-amber-400', 'from-fuchsia-500 to-purple-500', 'from-sky-500 to-cyan-400',
    'from-emerald-500 to-teal-400', 'from-rose-500 to-pink-400', 'from-indigo-500 to-blue-500',
    'from-yellow-500 to-orange-500', 'from-slate-600 to-slate-400',
  ];

  // Local editable copy (decoupled from parent until saved)
  const [draft, setDraft] = useState(() => ({ ...group }));
  const d = <K extends keyof GroupDetail>(k: K, v: GroupDetail[K]) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  // Track saved snapshot to compute dirty state
  const savedRef = useRef(JSON.stringify(group));
  const dirty = JSON.stringify(draft) !== savedRef.current;

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useUnsavedGuard(dirty);

  // Subject search
  const [allSubjects, setAllSubjects] = useState<DbSubject[]>([]);
  const [subjectSearch, setSubjectSearch] = useState(group.subject && group.subject !== '—' ? group.subject : '');
  const [subjectOpen, setSubjectOpen] = useState(false);
  const subjectRef = useRef<HTMLDivElement>(null);

  // Extra local settings
  const [billingModel, setBillingModel] = useState<'per-session' | 'per-month' | 'prepaid'>('per-session');
  const [joinRequests, setJoinRequests] = useState(false);
  const [autoSuspend, setAutoSuspend] = useState(true);
  const [graceDays, setGraceDays] = useState(7);
  // whatsappLink is stored in draft.whatsappLink
  const [classroom, setClassroom] = useState('');
  const [feedback, setFeedback] = useState<'off' | 'included' | 'paid'>('off');
  const [feedbackPrice, setFeedbackPrice] = useState(50);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    supabase
      .from('subjects')
      .select('id, name, label, curriculum')
      .order('curriculum', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data }) => setAllSubjects((data ?? []).map((s: any) => ({ id: s.id, name: s.name, label: s.label || s.name, curriculum: s.curriculum || '' }))));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (subjectRef.current && !subjectRef.current.contains(e.target as Node)) setSubjectOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredSubjects = allSubjects.filter((s) =>
    !subjectSearch || s.label.toLowerCase().includes(subjectSearch.toLowerCase())
  );

  const selectSubject = (label: string) => {
    d('subject', label);
    setSubjectSearch(label);
    setSubjectOpen(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveOk(false);
    try {
      const res = await fetch(`/api/groups/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.title || 'Untitled class',
          description: draft.description || null,
          subject: draft.subject && draft.subject !== '—' ? draft.subject : null,
          form_level: draft.level && draft.level !== '—' ? draft.level : null,
          max_students: draft.capacity > 0 ? draft.capacity : 20,
          price_per_session: draft.pricePerSession ?? null,
          status: draft.isPublic ? 'PUBLISHED' : 'DRAFT',
          whatsapp_link: draft.whatsappLink || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Save failed (${res.status})`);

      setGroup((g) => g ? { ...g, ...draft } : g);
      savedRef.current = JSON.stringify(draft);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    const parsed = JSON.parse(savedRef.current) as GroupDetail;
    setDraft({ ...parsed });
    setSubjectSearch(parsed.subject && parsed.subject !== '—' ? parsed.subject : '');
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {saveOk && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700">
          <Check className="size-4" /> Changes saved successfully.
        </div>
      )}
      {saveError && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700">{saveError}</div>
      )}
      <SettCard title="Basics">
        <SetField label="Class title">
          <input value={draft.title} onChange={(e) => d('title', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </SetField>
        <div className="grid grid-cols-2 gap-3">
          <SetField label="Subject">
            <div className="relative" ref={subjectRef}>
              <input
                value={subjectSearch}
                onChange={(e) => { setSubjectSearch(e.target.value); setSubjectOpen(true); d('subject', ''); }}
                onFocus={() => setSubjectOpen(true)}
                placeholder="Search subjects…"
                className="w-full px-3 py-2 pr-7 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
              {draft.subject && draft.subject !== '—' && (
                <button type="button" onClick={() => { d('subject', ''); setSubjectSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-ink">
                  <X className="size-3.5" />
                </button>
              )}
              {subjectOpen && filteredSubjects.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredSubjects.map((s) => (
                    <button key={s.id} type="button" onClick={() => selectSubject(s.label)}
                      className={cn('w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors',
                        draft.subject === s.label && 'bg-brand/10 text-brand-deep font-medium')}>
                      <span className="font-medium">{s.label}</span>
                      {s.curriculum && <span className="text-xs text-muted-foreground ml-1.5">· {s.curriculum}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </SetField>
          <SetField label="Level">
            <select
              value={draft.level && draft.level !== '—' ? draft.level : ''}
              onChange={(e) => d('level', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand appearance-none"
            >
              <option value="">Select level…</option>
              {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </SetField>
        </div>
        <SetField label="Description">
          <textarea value={draft.description} onChange={(e) => d('description', e.target.value)}
            className="w-full min-h-24 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </SetField>
      </SettCard>

      <SettCard title="Thumbnail">
        <div className={cn('h-24 rounded-xl bg-gradient-to-br grid place-items-center', draft.thumbnailGradient ?? 'from-brand to-emerald-400')}>
          <BookOpen className="size-8 text-white/80" />
        </div>
        <div className="mt-3 grid grid-cols-8 gap-2">
          {gradients.map((g) => (
            <button key={g} onClick={() => d('thumbnailGradient', g)}
              className={cn('h-8 rounded-md bg-gradient-to-br', g, draft.thumbnailGradient === g && 'ring-2 ring-brand ring-offset-2')} />
          ))}
        </div>
      </SettCard>

      {!isOneOnOne && (
        <SettCard title="Capacity & billing">
          <SetField label="Student limit" hint="Min 2 · Max 500.">
            <div className="inline-flex items-center gap-2">
              <button onClick={() => d('capacity', Math.max(2, draft.capacity - 1))}
                className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted text-lg font-semibold">−</button>
              <input
                type="number"
                value={draft.capacity}
                min={2}
                max={500}
                onChange={(e) => d('capacity', Math.max(2, Math.min(500, Number(e.target.value))))}
                className="w-20 text-center px-3 py-2 rounded-lg border border-border bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <button onClick={() => d('capacity', Math.min(500, draft.capacity + 1))}
                className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted text-lg font-semibold">+</button>
            </div>
          </SetField>
          <SetField label="Billing model">
            <div className="flex gap-2">
              {(['per-session', 'per-month', 'prepaid'] as const).map((m) => (
                <button key={m} onClick={() => setBillingModel(m)}
                  className={cn('flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors capitalize',
                    billingModel === m ? 'bg-brand text-white border-brand' : 'bg-background text-muted-foreground border-border hover:border-brand/50')}>
                  {m === 'per-session' ? 'Per session' : m === 'per-month' ? 'Monthly' : 'Prepaid'}
                </button>
              ))}
            </div>
          </SetField>
          <SetField label="Price per session (TTD)">
            <input type="number" value={draft.pricePerSession ?? 0} onChange={(e) => d('pricePerSession', Number(e.target.value))}
              className="w-32 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          </SetField>
        </SettCard>
      )}

      <SettCard title="Visibility & access">
        <Toggle label="Public listing" desc="Visible in the marketplace for students to discover." value={draft.isPublic} onChange={(v) => d('isPublic', v)} />
        <Toggle label="Require join requests" desc="Students must request to join; you approve or deny." value={joinRequests} onChange={setJoinRequests} />
      </SettCard>

      <SettCard title="Payment enforcement">
        <Toggle label="Auto-suspend on missed payment" desc="Automatically suspend access after the grace period." value={autoSuspend} onChange={setAutoSuspend} />
        {autoSuspend && (
          <SetField label="Grace period (days)">
            <div className="inline-flex items-center gap-2">
              <button onClick={() => setGraceDays(Math.max(1, graceDays - 1))} className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted">−</button>
              <span className="w-12 text-center font-bold">{graceDays}</span>
              <button onClick={() => setGraceDays(graceDays + 1)} className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted">+</button>
            </div>
          </SetField>
        )}
      </SettCard>

      <SettCard title="Communication channel">
        <div className="flex gap-2">
          {(['native', 'whatsapp', 'classroom'] as const).map((ch) => {
            const active = ch === 'native' ? !draft.whatsappLink && !classroom : ch === 'whatsapp' ? !!draft.whatsappLink : !!classroom;
            return (
              <button key={ch} onClick={() => { if (ch === 'native') { d('whatsappLink', ''); setClassroom(''); } }}
                className={cn('flex-1 py-2 rounded-lg text-xs font-semibold border capitalize transition-colors',
                  active ? 'bg-brand text-white border-brand' : 'bg-background text-muted-foreground border-border hover:border-brand/50')}>
                {ch === 'native' ? 'iTutor stream' : ch === 'whatsapp' ? 'WhatsApp' : 'Google Classroom'}
              </button>
            );
          })}
        </div>
        <SetField label="WhatsApp group link (optional)">
          <input value={draft.whatsappLink ?? ''} onChange={(e) => d('whatsappLink', e.target.value)} placeholder="https://chat.whatsapp.com/..."
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </SetField>
        <SetField label="Google Classroom link (optional)">
          <input value={classroom} onChange={(e) => setClassroom(e.target.value)} placeholder="https://classroom.google.com/..."
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        </SetField>
      </SettCard>

      <SettCard title="Feedback & parent reports">
        <div className="flex gap-2">
          {(['off', 'included', 'paid'] as const).map((f) => (
            <button key={f} onClick={() => setFeedback(f)}
              className={cn('flex-1 py-2 rounded-lg text-xs font-semibold border capitalize transition-colors',
                feedback === f ? 'bg-brand text-white border-brand' : 'bg-background text-muted-foreground border-border hover:border-brand/50')}>
              {f === 'off' ? 'Off' : f === 'included' ? 'Included' : 'Paid add-on'}
            </button>
          ))}
        </div>
        {feedback === 'paid' && (
          <SetField label="Feedback price (TTD)">
            <input type="number" value={feedbackPrice} onChange={(e) => setFeedbackPrice(Number(e.target.value))}
              className="w-32 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          </SetField>
        )}
      </SettCard>

      <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 space-y-3">
        <h3 className="text-sm font-bold text-rose-700">Danger zone</h3>
        <button className="w-full flex items-start gap-3 rounded-xl border border-rose-200 bg-background px-4 py-3 text-left hover:bg-muted/40">
          <Trash2 className="size-4 mt-0.5 text-rose-600" />
          <div>
            <div className="text-sm font-semibold text-rose-700">Delete class</div>
            <div className="text-xs text-muted-foreground">Permanently remove this class and its data.</div>
          </div>
        </button>
      </div>

      <UnsavedBar dirty={dirty} onSave={handleSave} onDiscard={handleDiscard} saveLabel="Save class settings" saving={saving} />
    </div>
  );
}

function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
      <div>
        <div className="text-sm font-semibold text-ink">{label}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <button onClick={() => onChange(!value)}
        className={cn('w-11 h-6 rounded-full p-0.5 transition shrink-0', value ? 'bg-brand' : 'bg-muted')}>
        <span className={cn('block size-5 rounded-full bg-white shadow transition', value && 'translate-x-5')} />
      </button>
    </div>
  );
}

/* ----------- Analytics ----------- */
function AnalyticsTab({ group, members }: { group: GroupDetail; members: GroupMember[] }) {
  const months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const enroll = [2, 4, 5, 7, 8, members.filter((m) => m.status === 'active').length || 3];
  const revenue = [180, 420, 600, 940, 1180, group.earningsTtd ?? 1440];
  const maxE = Math.max(...enroll, 1);
  const maxR = Math.max(...revenue, 1);
  const outstanding = members.reduce((s, m) => s + (m.paymentStatus === 'overdue' ? (m.outstandingTtd ?? 0) : 0), 0);
  const momE = Math.round(((enroll[enroll.length - 1] - enroll[enroll.length - 2]) / (enroll[enroll.length - 2] || 1)) * 100);
  const momR = Math.round(((revenue[revenue.length - 1] - revenue[revenue.length - 2]) / (revenue[revenue.length - 2] || 1)) * 100);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MomCard label="Enrollment MoM" value={`${momE > 0 ? '+' : ''}${momE}%`} positive={momE >= 0} />
        <MomCard label="Revenue MoM" value={`${momR > 0 ? '+' : ''}${momR}%`} positive={momR >= 0} />
        <MomCard label="Active members" value={String(members.filter((m) => m.status === 'active').length)} positive />
        <MomCard label="Outstanding (TTD)" value={outstanding.toLocaleString()} positive={outstanding === 0} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Enrollment by month" caption={`Peak: ${maxE} members`}>
          {enroll.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full rounded-t-md bg-gradient-to-t from-brand to-emerald-300" style={{ height: `${(v / maxE) * 100}%` }} />
              <div className="text-[10px] text-muted-foreground">{months[i]}</div>
            </div>
          ))}
        </ChartCard>
        <ChartCard title="Revenue by month (TTD)" caption={`Peak: TTD ${maxR.toLocaleString()}`}>
          {revenue.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full rounded-t-md bg-gradient-to-t from-amber-500 to-amber-300" style={{ height: `${(v / maxR) * 100}%` }} />
              <div className="text-[10px] text-muted-foreground">{months[i]}</div>
            </div>
          ))}
        </ChartCard>
      </div>
    </div>
  );
}

/* ----------- Atom components ----------- */
function Pill({ tone, label }: { tone: 'emerald' | 'rose' | 'amber' | 'slate'; label: string }) {
  const cls = { emerald: 'bg-emerald-100 text-emerald-700', rose: 'bg-rose-100 text-rose-700', amber: 'bg-amber-100 text-amber-800', slate: 'bg-slate-100 text-slate-600' }[tone];
  return <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full', cls)}>{label}</span>;
}

function Banner({ tone, icon: Icon, title, body }: { tone: 'rose' | 'amber'; icon: any; title: string; body: string }) {
  const cls = { rose: 'border-rose-200 bg-rose-50 text-rose-900', amber: 'border-amber-200 bg-amber-50 text-amber-900' }[tone];
  return (
    <div className={cn('rounded-xl border px-4 py-3 flex items-start gap-3', cls)}>
      <Icon className="size-4 mt-0.5" />
      <div><div className="font-semibold text-sm">{title}</div><div className="text-xs opacity-90">{body}</div></div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
      <div className="mx-auto size-12 rounded-full bg-muted grid place-items-center text-muted-foreground"><Icon className="size-5" /></div>
      <div className="mt-3 font-semibold text-ink">{title}</div>
      <div className="text-sm text-muted-foreground">{body}</div>
    </div>
  );
}

function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-1.5 border-b border-border last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-ink font-semibold capitalize">{value}</span>
    </div>
  );
}

function SettCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
      <h3 className="font-bold text-ink">{title}</h3>
      {children}
    </div>
  );
}

function SetField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-semibold text-ink mb-1">{label}</div>
      {hint && <div className="text-xs text-muted-foreground mb-2">{hint}</div>}
      {children}
    </div>
  );
}

function MenuBtn({ icon: Icon, label, onClick, destructive }: { icon: any; label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button onClick={onClick} className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted', destructive && 'text-rose-600 hover:bg-rose-50')}>
      <Icon className="size-4" /> {label}
    </button>
  );
}

function MomCard({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
      <div className={cn('mt-2 text-2xl font-bold flex items-center gap-1', positive ? 'text-emerald-700' : 'text-rose-700')}>
        {value}
        {positive ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
      </div>
    </div>
  );
}

function ChartCard({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink">{title}</h3>
        <span className="text-[11px] text-muted-foreground">{caption}</span>
      </div>
      <div className="mt-6 h-40 flex items-end gap-3">{children}</div>
    </div>
  );
}

function formatRelative(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.round(diff / 86400000)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
