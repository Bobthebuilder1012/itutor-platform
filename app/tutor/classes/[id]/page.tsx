'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Users, UserPlus, Copy, Check, Star,
  Bell, X, Plus, ExternalLink, Trash2, Globe, Eye,
  Video, MoreVertical, Pin, Sparkles, Link as LinkIcon, Paperclip, AlertTriangle, ShieldAlert,
  Mail, MessageSquare, DollarSign, BarChart3, ArrowUp, ArrowDown, Lock,
  Calendar as CalendarIcon, BookOpen, Ban, Repeat, Clock, Info, Image as ImageIcon, ArrowUpRight, ChevronRight,
  CreditCard, RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useUnsavedGuard } from '@/lib/hooks/useUnsavedGuard';
import { UnsavedBar } from '@/components/UnsavedBar';
import { supabase } from '@/lib/supabase/client';
import { fmtTTD } from '@/lib/utils/formatCurrency';
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

type Subscriber = {
  id: string;
  student_id: string;
  status: string;
  payment_status: string;
  plan_price_ttd: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_payment_due_at: string | null;
  last_paid_at: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  grace_period_ends_at: string | null;
  student: { id: string; full_name: string | null; avatar_url: string | null; email: string | null } | null;
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
  memberServiceFee: number;
  billingModel: 'per-session' | 'per-month' | 'prepaid';
  status: string;
  visibility: 'public' | 'private';
  isPublic: boolean;
  requireJoinRequests: boolean;
  autoSuspendMissedPayment: boolean;
  gracePeriodDays: number;
  primaryChannel: 'native' | 'whatsapp' | 'classroom';
  googleClassroomLink: string;
  feedbackMode: 'off' | 'included_free' | 'paid_addon';
  parentFeedbackPrice: number;
  thumbnailGradient?: string;
  recurrenceRule?: string;
  videoProvider?: string;
  earningsTtd?: number;
  totalSessionsRun?: number;
  rating?: number | null;
  reviewCount?: number;
  whatsappLink?: string;
  meetingLink?: string;
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
        const pricingModel = g.pricing_model ?? 'FREE';
        const billingModel: GroupDetail['billingModel'] =
          pricingModel === 'PER_SESSION' ? 'per-session' :
          pricingModel === 'MONTHLY' ? 'per-month' : 'prepaid';
        const visibilityVal: GroupDetail['visibility'] =
          g.visibility === 'private' ? 'private' : 'public';

        setGroup({
          id: g.id,
          title: g.name || 'Untitled class',
          subject: g.subject || '—',
          level: g.form_level || '—',
          description: g.description || g.bio || '',
          capacity: g.max_students ?? 20,
          enrolled: 0,
          pricePerSession: billingModel === 'per-month'
            ? (g.price_monthly ?? g.price_per_session ?? null)
            : (g.price_per_session ?? null),
          memberServiceFee: g.member_service_fee ?? 0,
          billingModel,
          status: g.status ?? 'DRAFT',
          visibility: visibilityVal,
          isPublic: visibilityVal === 'public',
          requireJoinRequests: g.require_join_requests ?? false,
          autoSuspendMissedPayment: g.auto_suspend_missed_payment ?? false,
          gracePeriodDays: g.grace_period_days ?? 7,
          primaryChannel: (g.primary_channel ?? 'native') as GroupDetail['primaryChannel'],
          googleClassroomLink: g.google_classroom_link ?? '',
          feedbackMode: (g.feedback_mode ?? 'off') as GroupDetail['feedbackMode'],
          parentFeedbackPrice: g.parent_feedback_price ?? 0,
          recurrenceRule: g.recurrence_rule,
          earningsTtd: 0,
          totalSessionsRun: 0,
          whatsappLink: g.whatsapp_url ?? g.whatsapp_link ?? '',
          meetingLink: g.meeting_link ?? '',
          rating: null,
          reviewCount: 0,
        });
      }

      // Fetch members + subscribers in parallel (service client bypasses RLS)
      let rawMembers: any[] = [];
      let subMap = new Map<string, any>(); // studentId → subscription enrollment
      try {
        const [mRes, sRes] = await Promise.all([
          fetch(`/api/groups/${groupId}/members`),
          fetch(`/api/groups/${groupId}/subscribers`),
        ]);
        if (mRes.ok) rawMembers = (await mRes.json()).members ?? [];
        if (sRes.ok) {
          const subs: any[] = (await sRes.json()).subscribers ?? [];
          for (const s of subs) subMap.set(s.student_id, s);
        }
      } catch { /* leave empty */ }

      const now = new Date();
      function derivePaymentStatus(sub: any): 'paid' | 'pending' | 'overdue' {
        if (!sub) return 'pending';
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
        // Active subscription within a current paid period → paid.
        // Use status='ACTIVE' as the primary signal; payment_status is a secondary
        // check but we don't gate on it because activate_subscription sets both
        // atomically and payment_status can be stale if DB state drifts.
        if (sub.status === 'ACTIVE' && periodEnd && periodEnd > now) return 'paid';
        if (sub.status === 'GRACE' || sub.payment_status === 'OVERDUE') return 'overdue';
        if (sub.status === 'SUSPENDED') return 'overdue';
        return 'pending';
      }

      setMembers(rawMembers.map((m: any): GroupMember => ({
        id: m.id,
        studentId: m.user_id,
        name: m.profile?.full_name || m.profile?.display_name || 'Student',
        paymentStatus: derivePaymentStatus(subMap.get(m.user_id)),
        status: m.status ?? 'active',
        joinedAt: m.joined_at ?? null,
      })));
      if (g) setGroup((prev) => prev ? { ...prev, enrolled: rawMembers.filter((m: any) => ['approved', 'active'].includes(m.status)).length } : prev);

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
          setPosts((pJson.posts ?? []).map((p: any): StreamPost => {
            const msgBody: string = p.message_body ?? p.body ?? p.content ?? '';
            const lines = msgBody.split('\n');
            const derivedTitle = lines[0]?.slice(0, 80) ?? '';
            const derivedBody = lines.slice(1).join('\n').trim();
            return {
              id: p.id,
              kind: (p.post_type ?? p.kind ?? 'announcement') as StreamPost['kind'],
              title: derivedTitle,
              body: derivedBody,
              at: formatRelative(p.created_at),
              pinned: p.is_pinned ?? p.pinned ?? false,
              pendingApproval: p.pending_approval ?? false,
              attachmentName: p.attachment_name,
              linkUrl: p.link_url,
            };
          }));
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
    { key: 'payments', label: group.billingModel === 'per-month' ? 'Subscribers' : 'Payments' },
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
          {tab === 'payments'  && (group.billingModel === 'per-month' ? <SubscribersTab group={group} /> : <PaymentsTab members={members} group={group} />)}
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
    // Combine title + body into message_body (title on first line)
    const message_body = body.trim() ? `${title.trim()}\n${body.trim()}` : title.trim();
    // Map UI kind → DB post_type
    const postTypeMap: Record<string, string> = {
      announcement: 'announcement',
      attachment: 'content',
      link: 'content',
      'ai-recap': 'content',
    };
    const post_type = postTypeMap[composer ?? ''] ?? 'announcement';
    try {
      const res = await fetch(`/api/groups/${group.id}/stream/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_type, message_body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed to post');
      const p = json.post;
      setPosts([{
        id: p?.id ?? `tmp-${Date.now()}`,
        kind: composer!,
        title: title.trim(),
        body: body.trim(),
        at: 'Just now',
        pinned: false,
        pendingApproval: false,
      }, ...posts]);
    } catch (e: any) {
      alert(e?.message ?? 'Failed to create post');
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
                <RosterRow key={m.studentId} m={m} groupId={group.id} onUpdate={(p) => updateMember(m.studentId, p)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RosterRow({ m, onUpdate, groupId }: { m: GroupMember; onUpdate: (p: Partial<GroupMember>) => void; groupId: string }) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<null | 'suspend' | 'ban' | 'remove'>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');

  async function handleRemoveConfirm() {
    setRemoving(true);
    setRemoveError('');
    try {
      const res = await fetch(`/api/groups/${groupId}/members/${m.studentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`);
      onUpdate({ status: 'removed' });
      setConfirm(null);
    } catch (e: any) {
      setRemoveError(e?.message ?? 'Removal failed. Please try again.');
    } finally {
      setRemoving(false);
    }
  }

  const statusMeta: Record<string, { label: string; chip: string }> = {
    pending_approval: { label: 'Pending',   chip: 'bg-amber-100 text-amber-800 border-amber-200' },
    invited:          { label: 'Invited',   chip: 'bg-sky-100 text-sky-700 border-sky-200' },
    active:           { label: 'Active',    chip: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    approved:         { label: 'Active',    chip: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    suspended:        { label: 'Suspended', chip: 'bg-amber-100 text-amber-800 border-amber-200' },
    banned:           { label: 'Banned',    chip: 'bg-rose-100 text-rose-700 border-rose-200' },
    removed:          { label: 'Removed',   chip: 'bg-muted text-muted-foreground border-border' },
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
      body: `${m.name} will lose access immediately. If they have an active subscription, a refund will be initiated pending admin approval.`,
      action: 'Remove', tone: 'rose',
      run: () => {},
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
              {m.paymentStatus === 'overdue' && <div className="text-[11px] text-rose-600 font-semibold">Outstanding {fmtTTD(m.outstandingTtd ?? 0)}</div>}
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
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !removing && setConfirm(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-background border border-border shadow-xl p-6 space-y-4">
              <div className="font-bold text-ink text-lg">{conf.title}</div>
              <p className="text-sm text-muted-foreground">{conf.body}</p>
              {confirm === 'remove' && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  If the tutor payout was already released, iTutor will refund the student and recover the amount from the tutor&apos;s future earnings.
                </div>
              )}
              {removeError && <p className="text-xs text-rose-600 font-medium">{removeError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setConfirm(null)} disabled={removing} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted disabled:opacity-50">Cancel</button>
                <button
                  onClick={async () => {
                    if (confirm === 'remove') {
                      await handleRemoveConfirm();
                    } else {
                      conf.run();
                      setConfirm(null);
                    }
                  }}
                  disabled={removing}
                  className={cn('px-4 py-2 rounded-xl text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50',
                    conf.tone === 'rose' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700')}>
                  {removing
                    ? <><span className="size-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Removing...</>
                    : conf.action}
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
          <span className="text-emerald-700 font-bold">Collected {fmtTTD(group.earningsTtd ?? 0)}</span>
          <span className="text-muted-foreground mx-2">vs</span>
          <span className={cn('font-bold', outstanding > 0 ? 'text-rose-700' : 'text-muted-foreground')}>
            Outstanding {fmtTTD(outstanding)}
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

/* ----------- Subscribers (monthly groups) ----------- */
function SubscribersTab({ group }: { group: GroupDetail }) {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<Subscriber | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');

  useEffect(() => { fetchSubs(); }, [group.id]);

  async function fetchSubs() {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/subscribers`);
      if (res.ok) {
        const json = await res.json();
        setSubscribers(json.subscribers ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    setRemoveError('');
    try {
      const res = await fetch(`/api/groups/${group.id}/members/${removeTarget.student_id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`);

      setSubscribers((subs) => subs.map((s) =>
        s.id === removeTarget.id
          ? { ...s, status: 'CANCELLED' }
          : s
      ));
      setRemoveTarget(null);
    } catch (e: any) {
      setRemoveError(e?.message ?? 'Removal failed. Please try again.');
    } finally {
      setRemoving(false);
    }
  }

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-TT', { day: 'numeric', month: 'short' }) : '—';

  const statusCfg: Record<string, { label: string; cls: string }> = {
    ACTIVE:             { label: 'Active',      cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    GRACE:              { label: 'Grace',        cls: 'bg-amber-100 text-amber-800 border-amber-200' },
    SUSPENDED:          { label: 'Suspended',   cls: 'bg-rose-100 text-rose-800 border-rose-200' },
    CANCELLED:          { label: 'Cancelled',   cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
    PENDING_PAYMENT:    { label: 'Pending',      cls: 'bg-blue-100 text-blue-800 border-blue-200' },
    ACTIVATION_FAILED:  { label: 'Activating',  cls: 'bg-blue-100 text-blue-800 border-blue-200' },
    WAITLISTED:         { label: 'Waitlisted',  cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  };

  const activeCount = subscribers.filter((s) => ['ACTIVE', 'GRACE', 'SUSPENDED'].includes(s.status)).length;
  const overdueCount = subscribers.filter((s) => s.status === 'GRACE').length;

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Subscribers</h2>
          <p className="text-xs text-muted-foreground">{activeCount} active · {overdueCount} in grace period</p>
        </div>
        <button onClick={fetchSubs} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-semibold hover:bg-muted">
          <RefreshCw className="size-3.5" /> Refresh
        </button>
      </div>

      {subscribers.length === 0 ? (
        <EmptyState icon={CreditCard} title="No subscribers yet" body="When students subscribe to this class, they will appear here." />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-bold px-4 py-2">Student</th>
                <th className="text-left font-bold px-4 py-2">Status</th>
                <th className="text-left font-bold px-4 py-2">Price</th>
                <th className="text-left font-bold px-4 py-2">Next due</th>
                <th className="text-left font-bold px-4 py-2">Last paid</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {subscribers.map((sub) => {
                const sc = statusCfg[sub.status] ?? { label: sub.status, cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' };
                const isRemovable = ['ACTIVE', 'GRACE', 'SUSPENDED'].includes(sub.status);
                const displayName = sub.student?.full_name ?? 'Student';
                return (
                  <tr key={sub.id} className={cn(
                    sub.status === 'GRACE' && 'bg-amber-50/40',
                    sub.status === 'SUSPENDED' && 'bg-rose-50/40',
                    sub.status === 'CANCELLED' && 'opacity-60',
                  )}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-gradient-to-br from-brand to-emerald-400 grid place-items-center text-xs font-bold text-white">
                          {displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-ink">{displayName}</div>
                          {sub.cancel_at_period_end && (
                            <div className="text-[10px] text-zinc-500 font-medium flex items-center gap-1">
                              <X className="size-2.5" /> Cancels {fmtDate(sub.current_period_end)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border', sc.cls)}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-ink">
                      {sub.plan_price_ttd ? fmtTTD(sub.plan_price_ttd) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {sub.status === 'GRACE' ? (
                        <span className="text-amber-700 font-semibold flex items-center gap-1">
                          <AlertTriangle className="size-3" /> Overdue
                        </span>
                      ) : fmtDate(sub.next_payment_due_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(sub.last_paid_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {isRemovable && (
                        <button
                          onClick={() => { setRemoveTarget(sub); setRemoveError(''); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 text-rose-600 text-[11px] font-semibold hover:bg-rose-50 transition">
                          <Trash2 className="size-3" /> Remove
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

      {/* Remove modal */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setRemoveTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-background border border-border shadow-xl p-6 space-y-4">
            <div>
              <div className="font-bold text-ink">Remove {removeTarget.student?.full_name ?? 'this student'}?</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                The student will be removed from this class and receive a full refund for the current month.
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              If the tutor payout was already released, iTutor will refund the student now and recover the amount from future tutor earnings.
            </div>

            {removeError && <div className="text-xs text-rose-600 font-medium">{removeError}</div>}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setRemoveTarget(null)} className="px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={handleRemove} disabled={removing}
                className="px-4 py-2 rounded-xl text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 bg-rose-600 hover:bg-rose-700">
                {removing
                  ? <><span className="size-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Removing...</>
                  : 'Confirm removal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------- Settings ----------- */
const SETTINGS_SECTIONS = [
  { id: 'basics',    label: 'Basics',            icon: Info },
  { id: 'capacity',  label: 'Capacity',          icon: Users },
  { id: 'billing',   label: 'Billing',           icon: DollarSign },
  { id: 'access',    label: 'Access & policies', icon: Lock },
  { id: 'channels',  label: 'Communication',     icon: MessageSquare },
  { id: 'feedback',  label: 'Parent feedback',   icon: Mail },
  { id: 'danger',    label: 'Danger zone',        icon: AlertTriangle },
] as const;
type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

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

  const [section, setSection] = useState<SettingsSectionId>('basics');
  const tryChangeSection = (id: SettingsSectionId) => {
    if (dirty && !window.confirm('You have unsaved changes. Discard them and switch sections?')) return;
    if (dirty) setDraft({ ...group });
    setSection(id);
  };
  // Remember join-requests value from when class was public so we can restore it on public→private→public round-trip
  const lastPublicJoinReq = useRef<boolean>(
    group.visibility === 'public' ? group.requireJoinRequests : false
  );

  // Subject search
  const [allSubjects, setAllSubjects] = useState<DbSubject[]>([]);
  const [subjectSearch, setSubjectSearch] = useState(group.subject && group.subject !== '—' ? group.subject : '');
  const [subjectOpen, setSubjectOpen] = useState(false);
  const subjectRef = useRef<HTMLDivElement>(null);

  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
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
      const pricingModelMap: Record<string, string> = {
        'per-session': 'PER_SESSION',
        'per-month': 'MONTHLY',
        'prepaid': 'FREE',
      };

      // Basics + capacity/billing → existing groups PATCH (name, description, subject, level, capacity, price, billing model)
      const basicRes = await fetch(`/api/groups/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.title || 'Untitled class',
          description: draft.description || null,
          subject: draft.subject && draft.subject !== '—' ? draft.subject : null,
          form_level: draft.level && draft.level !== '—' ? draft.level : null,
          max_students: draft.capacity > 0 ? draft.capacity : 20,
          price_per_session: draft.billingModel !== 'per-month' ? (draft.pricePerSession ?? null) : null,
          price_monthly: draft.billingModel === 'per-month' ? (draft.pricePerSession ?? null) : null,
          member_service_fee: draft.memberServiceFee ?? 0,
          pricing_model: pricingModelMap[draft.billingModel] ?? 'FREE',
          status: draft.visibility === 'private' ? 'DRAFT' : 'PUBLISHED',
        }),
      });
      const basicJson = await basicRes.json().catch(() => ({}));
      if (!basicRes.ok) throw new Error(basicJson?.error ?? `Save failed (${basicRes.status})`);

      // Access, comms, feedback → new canonical settings endpoint
      const settingsRes = await fetch(`/api/classes/${draft.id}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: draft.visibility,
          require_join_requests: draft.requireJoinRequests,
          auto_suspend_missed_payment: draft.autoSuspendMissedPayment,
          grace_period_days: draft.gracePeriodDays,
          primary_channel: draft.primaryChannel,
          whatsapp_url: draft.whatsappLink || null,
          google_classroom_link: draft.googleClassroomLink || null,
          meeting_link: draft.meetingLink || null,
          parent_feedback_mode: draft.feedbackMode,
          parent_feedback_price: draft.feedbackMode === 'paid_addon' ? (draft.parentFeedbackPrice ?? 0) : null,
        }),
      });
      const settingsJson = await settingsRes.json().catch(() => ({}));
      if (!settingsRes.ok) {
        const detail = settingsJson?.details?.[0]?.message ?? settingsJson?.error ?? `Save failed (${settingsRes.status})`;
        throw new Error(detail);
      }

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

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/classes/${group.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deleteReason || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        router.replace('/tutor/classes');
        return;
      }
      if (res.status === 409) {
        setDeleteError(json.message ?? 'Cannot delete class — resolve outstanding items first.');
      } else {
        setDeleteError(json.error ?? 'Failed to delete. Please try again.');
      }
    } catch {
      setDeleteError('Network error. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-4">
      {saveOk && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700">
          <Check className="size-4" /> Changes saved successfully.
        </div>
      )}
      {saveError && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700">{saveError}</div>
      )}

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        {/* Sidebar nav */}
        <nav className="space-y-1">
          {SETTINGS_SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            const danger = s.id === 'danger';
            return (
              <button key={s.id} onClick={() => tryChangeSection(s.id)}
                className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition',
                  active
                    ? danger ? 'bg-rose-50 border border-rose-200 text-rose-700' : 'bg-background border border-border text-ink shadow-sm'
                    : danger ? 'text-rose-600 hover:bg-rose-50/60' : 'text-muted-foreground hover:bg-background')}>
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 text-left">{s.label}</span>
                <ChevronRight className={cn('size-3.5 transition', active && !danger && 'text-brand-deep', active && danger && 'text-rose-600')} />
              </button>
            );
          })}
        </nav>

        {/* Content panel */}
        <div className="rounded-2xl bg-background border border-border p-6 space-y-6">
          {section === 'basics' && (
            <>
              <SettingsHead title="Basics" desc="Core details students see in your class listing." />
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
              <SetField label="Description" hint="Shown on your public listing and marketplace card.">
                <textarea value={draft.description} onChange={(e) => d('description', e.target.value)}
                  className="w-full min-h-24 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </SetField>
              <div className="pt-2 border-t border-border space-y-3">
                <div className="text-sm font-semibold text-ink">Thumbnail</div>
                <div className={cn('h-20 rounded-xl bg-gradient-to-br grid place-items-center', draft.thumbnailGradient ?? 'from-brand to-emerald-400')}>
                  <ImageIcon className="size-7 text-white/80" />
                </div>
                <div className="grid grid-cols-8 gap-2">
                  {gradients.map((g) => (
                    <button key={g} onClick={() => d('thumbnailGradient', g)}
                      className={cn('h-7 rounded-md bg-gradient-to-br', g, draft.thumbnailGradient === g && 'ring-2 ring-brand ring-offset-2')} />
                  ))}
                </div>
              </div>
            </>
          )}

          {section === 'capacity' && (
            <>
              <SettingsHead title="Capacity" desc="Control how many students can be in this class." />
              {isOneOnOne ? (
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  This is a 1-on-1 class — capacity is fixed at 1.
                </div>
              ) : (
                <SetField label="Student limit" hint="Min 2 · Max 500.">
                  <div className="inline-flex items-center gap-2">
                    <button onClick={() => d('capacity', Math.max(2, draft.capacity - 1))}
                      className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted text-lg font-semibold">−</button>
                    <input
                      type="number" value={draft.capacity} min={2} max={500}
                      onChange={(e) => d('capacity', Math.max(2, Math.min(500, Number(e.target.value))))}
                      className="w-20 text-center px-3 py-2 rounded-lg border border-border bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                    <button onClick={() => d('capacity', Math.min(500, draft.capacity + 1))}
                      className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted text-lg font-semibold">+</button>
                  </div>
                </SetField>
              )}
            </>
          )}

          {section === 'billing' && (
            <>
              <SettingsHead title="Billing" desc="How members are charged for this class." />
              <SetField label="Billing model" infoTitle="Billing model" infoBlurb="Per-session: charged after each class. Per-month: a flat monthly fee. Prepaid: students pay upfront for a block of sessions.">
                <div className="grid grid-cols-3 gap-2">
                  {(['per-session', 'per-month', 'prepaid'] as const).map((m) => (
                    <button key={m} onClick={() => d('billingModel', m)}
                      className={cn('px-3 py-2 rounded-lg border text-xs font-semibold capitalize transition-colors',
                        draft.billingModel === m ? 'bg-brand-soft border-brand text-brand-deep' : 'bg-background text-muted-foreground border-border hover:text-ink')}>
                      {m === 'per-session' ? 'Per session' : m === 'per-month' ? 'Monthly' : 'Prepaid'}
                    </button>
                  ))}
                </div>
              </SetField>
              <div className="grid grid-cols-2 gap-3">
                <SetField label={draft.billingModel === 'per-month' ? 'Monthly price (TTD)' : 'Price per session (TTD)'}>
                  <input type="number" value={draft.pricePerSession ?? 0} onChange={(e) => d('pricePerSession', Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                </SetField>
                <SetField label="Per-member service fee (TTD)" infoTitle="Service fee" infoBlurb="A small flat fee added to each member's bill — useful to cover materials, platform costs, or admin overhead.">
                  <input type="number" value={draft.memberServiceFee} onChange={(e) => d('memberServiceFee', Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                </SetField>
              </div>
            </>
          )}

          {section === 'access' && (
            <>
              <SettingsHead title="Access & policies" desc="Who can join and what happens when payments fall behind." />
              <SetField label="Visibility" hint="Public classes appear in the marketplace. Private classes don't, and always require approval to join.">
                <div className="grid grid-cols-2 gap-2">
                  {(['public', 'private'] as const).map((v) => (
                    <button key={v} onClick={() => {
                      if (v === draft.visibility) return;
                      if (v === 'private') {
                        lastPublicJoinReq.current = draft.requireJoinRequests;
                        setDraft((prev) => ({ ...prev, visibility: 'private', isPublic: false, requireJoinRequests: true }));
                      } else {
                        setDraft((prev) => ({ ...prev, visibility: 'public', isPublic: true, requireJoinRequests: lastPublicJoinReq.current }));
                      }
                    }}
                      className={cn('px-3 py-2 rounded-lg border text-xs font-semibold capitalize inline-flex items-center justify-center gap-1.5 transition-colors',
                        draft.visibility === v ? 'bg-brand-soft border-brand text-brand-deep' : 'bg-background text-muted-foreground border-border hover:text-ink')}>
                      {v === 'public' ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
                      {v}
                    </button>
                  ))}
                </div>
              </SetField>
              <Toggle
                label="Enable join requests"
                hint={draft.visibility === 'private' ? 'Private classes always require approval to join.' : 'Members must request approval before joining.'}
                value={draft.requireJoinRequests}
                onChange={(v) => d('requireJoinRequests', v)}
                disabled={draft.visibility === 'private'}
              />
              <Toggle label="Auto-suspend on overdue payment" hint="When a payment goes overdue past the grace window, the member is suspended until they pay." value={draft.autoSuspendMissedPayment} onChange={(v) => d('autoSuspendMissedPayment', v)} />
              {draft.autoSuspendMissedPayment && (
                <SetField label="Grace window (days)" infoTitle="Grace window" infoBlurb="How many days after a missed payment before the member is auto-suspended. Set to 0 to suspend immediately.">
                  <input type="number" value={draft.gracePeriodDays} onChange={(e) => d('gracePeriodDays', Number(e.target.value))}
                    className="w-32 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                </SetField>
              )}
            </>
          )}

          {section === 'channels' && (
            <>
              <SettingsHead title="Communication channels" desc="Where members go for class chatter outside of sessions." />
              <SetField label="WhatsApp group link">
                <input value={draft.whatsappLink ?? ''} onChange={(e) => d('whatsappLink', e.target.value)} placeholder="https://chat.whatsapp.com/…"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </SetField>
              <SetField label="Google Classroom link">
                <input value={draft.googleClassroomLink ?? ''} onChange={(e) => d('googleClassroomLink', e.target.value)} placeholder="https://classroom.google.com/c/…"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </SetField>
              <SetField label="Primary channel" infoTitle="Primary channel" infoBlurb="Where members are pointed for class chatter. iTutor native keeps everything in-app; WhatsApp/Classroom hands chat off to your existing group.">
                <div className="grid grid-cols-3 gap-2">
                  {(['native', 'whatsapp', 'classroom'] as const).map((ch) => {
                    const disabled =
                      (ch === 'whatsapp' && !draft.whatsappLink?.trim()) ||
                      (ch === 'classroom' && !draft.googleClassroomLink?.trim());
                    return (
                      <button key={ch}
                        disabled={disabled}
                        title={disabled ? 'Add the link above to use this channel.' : undefined}
                        onClick={() => !disabled && d('primaryChannel', ch)}
                        className={cn('px-3 py-2 rounded-lg border text-xs font-semibold capitalize inline-flex items-center justify-center gap-1.5 transition-colors',
                          draft.primaryChannel === ch ? 'bg-brand-soft border-brand text-brand-deep' : 'bg-background text-muted-foreground border-border hover:text-ink',
                          disabled && 'opacity-40 cursor-not-allowed hover:text-muted-foreground')}>
                        {ch === 'whatsapp' ? <MessageSquare className="size-3.5" /> : ch === 'classroom' ? <Globe className="size-3.5" /> : <Sparkles className="size-3.5" />}
                        {ch === 'native' ? 'iTutor native' : ch}
                      </button>
                    );
                  })}
                </div>
                {(!draft.whatsappLink?.trim() || !draft.googleClassroomLink?.trim()) && (
                  <div className="text-[11px] text-muted-foreground mt-1.5">Add a link above to enable that channel.</div>
                )}
              </SetField>
              <SetField label="Meeting link" infoTitle="Meeting link" infoBlurb="Paste your recurring Google Meet or Zoom link here. Students will use this to join every live session.">
                <input
                  value={draft.meetingLink ?? ''}
                  onChange={(e) => d('meetingLink', e.target.value)}
                  placeholder="https://meet.google.com/xxx-xxxx-xxx or https://zoom.us/j/…"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </SetField>
            </>
          )}

          {section === 'feedback' && (
            <>
              <SettingsHead title="Parent feedback" desc="Optional monthly reports you send to each student's parent." />
              <SetField label="Mode" infoTitle="Parent feedback" infoBlurb="A short monthly report you write for each student's parent. AI can optionally polish your wording. Charge for it as a paid add-on or include it free.">
                <div className="grid grid-cols-3 gap-2">
                  {(['off', 'included_free', 'paid_addon'] as const).map((f) => (
                    <button key={f} onClick={() => d('feedbackMode', f)}
                      className={cn('px-3 py-2 rounded-lg border text-xs font-semibold capitalize transition-colors',
                        draft.feedbackMode === f ? 'bg-brand-soft border-brand text-brand-deep' : 'bg-background text-muted-foreground border-border hover:text-ink')}>
                      {f === 'off' ? 'Off' : f === 'included_free' ? 'Included free' : 'Paid add-on'}
                    </button>
                  ))}
                </div>
              </SetField>
              {draft.feedbackMode === 'paid_addon' && (
                <SetField label="Price per report (TTD)" hint="Required before save — must be greater than 0.">
                  <input type="number" min={0} required value={draft.parentFeedbackPrice} onChange={(e) => d('parentFeedbackPrice', Number(e.target.value))}
                    className="w-32 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                </SetField>
              )}
            </>
          )}

          {section === 'danger' && (
            <>
              <SettingsHead title="Danger zone" desc="Irreversible actions. Double-check before confirming." tone="danger" />
              <div className="space-y-3">
                <button onClick={() => { setDeleteOpen(true); setDeleteConfirmText(''); setDeleteReason(''); setDeleteError(''); }}
                  className="w-full flex items-start gap-3 rounded-xl border border-rose-200 bg-background px-4 py-3 text-left hover:bg-rose-50 transition-colors">
                  <Trash2 className="size-4 mt-0.5 text-rose-600" />
                  <div>
                    <div className="text-sm font-semibold text-rose-700">Delete class</div>
                    <div className="text-xs text-muted-foreground">Permanently archive this class and all its data.</div>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 backdrop-blur-sm p-4" onClick={() => setDeleteOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-background border border-border shadow-pop p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-rose-100 grid place-items-center"><Trash2 className="size-5 text-rose-600" /></div>
              <div>
                <div className="font-bold text-ink">Delete &ldquo;{group.title}&rdquo;?</div>
                <div className="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</div>
              </div>
            </div>
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
              All sessions, roster data, and stream posts will be archived. Past earnings and payment records are preserved.
            </div>
            <div>
              <label className="text-xs font-semibold text-ink">Type <span className="font-bold">{group.title}</span> to confirm</label>
              <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder={group.title}
                className="mt-1.5 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-rose-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink">Reason <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="e.g. Course completed, consolidating classes…"
                className="mt-1.5 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            {deleteError && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{deleteError}</div>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteOpen(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={handleDelete} disabled={deleteConfirmText !== group.title || deleting}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
                {deleting ? <><span className="size-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Deleting…</> : 'Delete class'}
              </button>
            </div>
          </div>
        </div>
      )}

      <UnsavedBar dirty={dirty} onSave={handleSave} onDiscard={handleDiscard} saveLabel="Save class settings" saving={saving} />
    </div>
  );
}

function SettingsHead({ title, desc, tone }: { title: string; desc?: string; tone?: 'danger' }) {
  return (
    <div className="pb-4 border-b border-border">
      <div className={cn('text-base font-bold', tone === 'danger' ? 'text-rose-700' : 'text-ink')}>{title}</div>
      {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
    </div>
  );
}

function Toggle({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 rounded-xl border border-border p-4', disabled && 'opacity-70')}>
      <div className="flex-1">
        <div className="text-sm font-semibold text-ink">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <button
        type="button"
        disabled={disabled}
        title={disabled ? hint : undefined}
        onClick={() => !disabled && onChange(!value)}
        className={cn('w-11 h-6 rounded-full p-0.5 transition shrink-0', value ? 'bg-brand' : 'bg-muted', disabled && 'cursor-not-allowed')}>
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
        <ChartCard title="Revenue by month (TT$)" caption={`Peak: ${fmtTTD(maxR)}`}>
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

function SetField({ label, hint, infoTitle, infoBlurb, children }: { label: string; hint?: string; infoTitle?: string; infoBlurb?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-semibold text-ink inline-flex items-center gap-1.5 mb-1">
        {label}
        {infoTitle && infoBlurb && <InfoPop title={infoTitle} blurb={infoBlurb} />}
      </div>
      {hint && <div className="text-xs text-muted-foreground mb-2">{hint}</div>}
      {children}
    </div>
  );
}

function InfoPop({ title, blurb }: { title: string; blurb: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="size-4 grid place-items-center rounded-full text-muted-foreground hover:text-brand-deep"
        aria-label={`About ${title}`}
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <span className="absolute z-20 left-1/2 -translate-x-1/2 top-6 w-56 rounded-lg border border-border bg-background shadow-pop p-3 text-left">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-ink">{title}</span>
          <span className="block text-xs text-muted-foreground mt-1 font-normal normal-case">{blurb}</span>
        </span>
      )}
    </span>
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
