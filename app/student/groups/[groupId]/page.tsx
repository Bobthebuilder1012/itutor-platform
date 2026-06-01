'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Star, Calendar, Clock, Users, Check, Lock, BadgeCheck,
  Sparkles, X, Loader2, ShieldCheck, MessageCircle, Video, Bell,
  Paperclip, Link as LinkIcon, Pin, ExternalLink, Download, ShieldAlert,
  Ban, CreditCard,
} from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

/* ─── Types ───────────────────────────────────────────────────────── */

type Group = {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  tutor_id: string;
  tutor: { full_name: string | null; display_name: string | null } | null;
  max_students: number | null;
  require_join_requests: boolean;
  feedback_mode: string | null;
  primary_channel: string | null;
  whatsapp_link: string | null;
  google_classroom_link: string | null;
  pricing: number | null;
  pricing_model: string | null;
  visibility: string | null;
  tutor_rating?: number;
  tutor_reviews?: number;
  enrollment_count?: number;
  upcoming_sessions?: SessionRow[];
};

type SessionRow = {
  id: string;
  scheduled_start_at: string;
  duration_minutes?: number | null;
  meeting_link?: string | null;
  topic?: string | null;
};

type StreamPost = {
  id: string;
  kind: 'announcement' | 'attachment' | 'link';
  title?: string | null;
  body?: string | null;
  content?: string | null;
  pinned?: boolean;
  created_at?: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  link_url?: string | null;
};

type Member = {
  id: string;
  user_id: string;
  status: string;
  joined_at?: string;
  profile?: { full_name?: string | null; avatar_url?: string | null } | null;
  isSelf?: boolean;
};

type MemberStatus = 'active' | 'approved' | 'pending_approval' | 'pending' | 'invited' | 'suspended' | 'suspended_payment' | 'banned' | 'removed' | 'rejected' | null;

/* ─── Helpers ─────────────────────────────────────────────────────── */

const GRADIENTS: Record<string, { from: string; to: string }> = {
  math:    { from: 'from-orange-500', to: 'to-amber-400' },
  physics: { from: 'from-sky-500',    to: 'to-cyan-400' },
  chem:    { from: 'from-emerald-500',to: 'to-teal-400' },
  bio:     { from: 'from-green-500',  to: 'to-emerald-400' },
  english: { from: 'from-indigo-500', to: 'to-blue-500' },
  history: { from: 'from-rose-500',   to: 'to-pink-400' },
  econ:    { from: 'from-amber-500',  to: 'to-yellow-400' },
  account: { from: 'from-amber-500',  to: 'to-yellow-400' },
  sea:     { from: 'from-violet-500', to: 'to-purple-400' },
  info:    { from: 'from-fuchsia-500',to: 'to-purple-500' },
};

function getGradient(subject: string | null) {
  const s = (subject || '').toLowerCase();
  for (const [key, val] of Object.entries(GRADIENTS)) {
    if (s.includes(key)) return val;
  }
  return { from: 'from-brand', to: 'to-emerald-500' };
}

function getEmoji(subject: string | null) {
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

function formatDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function TutorInitials({ name, size = 48 }: { name: string; size?: number }) {
  const initials = name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="rounded-full bg-gradient-to-br from-brand to-emerald-400 grid place-items-center font-bold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

function MemberAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = (name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="rounded-full bg-gradient-to-br from-brand to-emerald-400 grid place-items-center font-bold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ScheduleRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
        <div className="text-sm text-ink font-medium">{value}</div>
      </div>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────── */

export default function StudentGroupPage({ params }: { params: { groupId: string } }) {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const groupId = params.groupId;

  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberStatus, setMemberStatus] = useState<MemberStatus>(null);
  const [joining, setJoining] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  // Subscription state (only populated for MONTHLY groups)
  const [subscriptionAccess, setSubscriptionAccess] = useState<any>(null);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (!groupId || profileLoading) return;
    if (!profile) { router.push('/login'); return; }
    loadGroup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, profile, profileLoading]);

  async function loadGroup() {
    setLoading(true);
    try {
      const { data: grp } = await supabase
        .from('groups')
        .select(`
          id, name, description, subject, tutor_id, max_students,
          require_join_requests, feedback_mode, primary_channel,
          whatsapp_link, google_classroom_link, pricing, pricing_model,
          visibility, archived_at,
          tutor:profiles!groups_tutor_id_fkey(full_name, display_name)
        `)
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

      setMemberStatus((membership?.status as MemberStatus) ?? null);

      const { count: enrollCount } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .in('status', ['active', 'approved']);

      const { data: ratingRows } = await supabase
        .from('ratings')
        .select('stars')
        .eq('tutor_id', grp.tutor_id);
      const ratings = (ratingRows ?? []).map((r: any) => Number(r.stars));
      const avgRating = ratings.length ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : null;

      // Fetch upcoming sessions
      const { data: occurrences } = await supabase
        .from('group_session_occurrences')
        .select('id, scheduled_start_at, duration_minutes, meeting_link')
        .gte('scheduled_start_at', new Date().toISOString())
        .order('scheduled_start_at', { ascending: true })
        .limit(5);

      const tutorObj = Array.isArray(grp.tutor) ? grp.tutor[0] : grp.tutor;

      setGroup({
        ...grp,
        tutor: tutorObj,
        tutor_rating: avgRating ?? undefined,
        tutor_reviews: ratings.length,
        enrollment_count: enrollCount ?? 0,
        upcoming_sessions: (occurrences ?? []) as SessionRow[],
      });

      // Fetch subscription access state for MONTHLY groups
      if (grp.pricing_model === 'MONTHLY') {
        try {
          const accessRes = await fetch(`/api/groups/${groupId}/access`);
          if (accessRes.ok) {
            const accessData = await accessRes.json();
            setSubscriptionAccess(accessData);
          }
        } catch {
          // non-critical — CTA degrades gracefully
        }
      }
    } catch (err) {
      console.error('[StudentGroupPage]', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubscribe() {
    if (!group) return;
    setSubscribing(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/subscribe`, { method: 'POST' });
      const data = await res.json();
      if (data.waitlisted) {
        setSubscriptionAccess({ ...subscriptionAccess, waitlisted: true, waitlist_position: data.position });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed to subscribe');
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch (err: any) {
      alert(err.message || 'Failed to start subscription. Please try again.');
    } finally {
      setSubscribing(false);
    }
  }

  async function handleJoin() {
    if (!group || !profile) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join');
      const status = data.member?.status as MemberStatus;
      setMemberStatus(status);
      setShowJoinModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to join class. Please try again.');
    } finally {
      setJoining(false);
    }
  }

  if (loading || profileLoading) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <h1 className="text-2xl font-bold text-ink">Class not found</h1>
        <Link href="/student/find-tutors" className="mt-4 inline-block text-brand-deep font-semibold">← Back to browse</Link>
      </div>
    );
  }

  const isEnrolled = memberStatus && ['active', 'approved', 'invited'].includes(memberStatus);
  const isSuspended = memberStatus === 'suspended' || memberStatus === 'suspended_payment';
  const isBanned = memberStatus === 'banned' || memberStatus === 'removed' || memberStatus === 'rejected';

  const subStatus = subscriptionAccess?.status as string | undefined;
  const isMonthly = group.pricing_model === 'MONTHLY';
  const subHasAccess = subscriptionAccess?.has_access === true;

  // Redirect enrolled subscribers (with active access) to the class homepage
  if (isMonthly && subStatus === 'ACTIVE' && subHasAccess) {
    return <ClassHomepage group={group} memberStatus={memberStatus} userId={profile!.id} subscriptionAccess={subscriptionAccess} />;
  }
  // Non-subscription enrolled view
  if (!isMonthly && (isEnrolled || isSuspended || isBanned)) {
    return <ClassHomepage group={group} memberStatus={memberStatus} userId={profile!.id} />;
  }

  /* ── Not enrolled — show detail / join page ── */
  const { from, to } = getGradient(group.subject);
  const emoji = getEmoji(group.subject);
  const tutorName = group.tutor?.display_name || group.tutor?.full_name || 'Your Tutor';
  const nextSession = group.upcoming_sessions?.[0];
  const schedule = nextSession
    ? (() => {
        const d = new Date(nextSession.scheduled_start_at);
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        return `${days[d.getDay()]}s at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      })()
    : null;
  const isPending = memberStatus === 'pending_approval' || memberStatus === 'pending';
  const isFull = group.max_students !== null && (group.enrollment_count ?? 0) >= group.max_students;
  const remaining = group.max_students !== null ? group.max_students - (group.enrollment_count ?? 0) : null;
  const price = Number(group.pricing ?? 0);
  const billingLabel = group.pricing_model === 'per_session' ? '/session' : group.pricing_model === 'per_course' ? '/term' : '/mo';
  const whatsIncluded = [
    'Live interactive sessions',
    ...(nextSession?.duration_minutes ? [`${formatDuration(nextSession.duration_minutes)} per session`] : []),
    ...(group.primary_channel === 'whatsapp' || group.whatsapp_link ? ['WhatsApp group access'] : []),
    ...(group.primary_channel === 'classroom' || group.google_classroom_link ? ['Google Classroom access'] : []),
    ...(group.feedback_mode === 'included_free' ? ['Free parent feedback reports'] : []),
    'Session recordings within 24 hours',
    'Direct messaging with tutor',
  ];

  return (
    <>
      <div className="max-w-3xl mx-auto space-y-6 pb-32">
        <Link href="/student/find-tutors" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink transition">
          <ArrowLeft className="size-4" /> All classes
        </Link>

        {/* Hero */}
        <section className={`relative rounded-3xl bg-gradient-to-br ${from} ${to} p-6 sm:p-8 text-white overflow-hidden`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="relative flex items-start gap-4">
            <div className="size-16 rounded-2xl bg-white grid place-items-center text-4xl shadow-md shrink-0">{emoji}</div>
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider font-bold opacity-90">{(group as any).subject_data?.label ?? (group as any).subject_data?.name ?? (group.subject || 'General')}</div>
              <h1 className="text-2xl sm:text-3xl font-bold mt-1 leading-tight">{group.name}</h1>
              {group.description && <p className="text-sm opacity-90 mt-2 line-clamp-2">{group.description}</p>}
            </div>
          </div>
          <div className="relative mt-5 flex flex-wrap gap-2">
            {group.feedback_mode === 'included_free' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white">
                <Sparkles className="size-3.5" /> Free parent feedback
              </span>
            )}
            {group.require_join_requests && (
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white">Approval required</span>
            )}
            {isFull && <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-black/30 text-white">Class full</span>}
          </div>
        </section>

        {isPending && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
            <div className="size-9 rounded-full bg-amber-500 grid place-items-center shrink-0">
              <Loader2 className="size-4 text-white animate-spin" />
            </div>
            <div>
              <div className="font-semibold text-amber-900 text-sm">Join request sent</div>
              <div className="text-xs text-amber-700">{tutorName} will review your request shortly.</div>
            </div>
          </div>
        )}

        {/* Subscription state banners */}
        {isMonthly && subStatus === 'GRACE' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-amber-900 text-sm">Payment due</div>
              <div className="text-xs text-amber-700">Renew before {subscriptionAccess?.grace_period_ends_at ? new Date(subscriptionAccess.grace_period_ends_at).toLocaleDateString('en-TT') : 'your grace period ends'} to keep access.</div>
            </div>
            <a href={`/student/subscriptions/${subscriptionAccess?.enrollment_id}/pay`}
              className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition shrink-0">
              Renew Now
            </a>
          </div>
        )}
        {isMonthly && subStatus === 'SUSPENDED' && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-red-900 text-sm flex items-center gap-1.5"><Ban className="size-4" /> Access suspended</div>
              <div className="text-xs text-red-700">Your subscription has been suspended due to non-payment.</div>
            </div>
            <a href={`/student/subscriptions/${subscriptionAccess?.enrollment_id}/pay`}
              className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition shrink-0">
              Reactivate
            </a>
          </div>
        )}
        {isMonthly && subStatus === 'ACTIVATION_FAILED' && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
            <CreditCard className="size-5 text-blue-600 shrink-0" />
            <div>
              <div className="font-semibold text-blue-900 text-sm">Payment received — activation pending</div>
              <div className="text-xs text-blue-700">Your access is being activated. Do not pay again.</div>
            </div>
          </div>
        )}
        {isMonthly && subscriptionAccess?.cancel_at_period_end && subStatus === 'ACTIVE' && (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 flex items-center justify-between gap-3">
            <div className="text-sm text-zinc-700">
              Cancels on {subscriptionAccess?.current_period_end ? new Date(subscriptionAccess.current_period_end).toLocaleDateString('en-TT') : 'period end'}
            </div>
            <button onClick={async () => {
              await fetch(`/api/subscriptions/${subscriptionAccess.enrollment_id}/undo-cancellation`, { method: 'POST' });
              const r = await fetch(`/api/groups/${groupId}/access`);
              if (r.ok) setSubscriptionAccess(await r.json());
            }} className="px-4 py-2 rounded-xl bg-zinc-700 text-white text-sm font-semibold hover:bg-zinc-800 transition shrink-0">
              Undo cancellation
            </button>
          </div>
        )}
        {isMonthly && subscriptionAccess?.waitlisted && (
          <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4 flex items-center gap-3">
            <Users className="size-5 text-brand shrink-0" />
            <div>
              <div className="font-semibold text-ink text-sm">You are #{subscriptionAccess.waitlist_position} on the waitlist</div>
              <div className="text-xs text-muted-foreground">You will be notified when a spot opens up.</div>
            </div>
          </div>
        )}

        {/* Tutor */}
        <Link href={`/student/tutors/${group.tutor_id}`}
          className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:bg-muted/40 transition">
          <TutorInitials name={tutorName} size={48} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-ink truncate">{tutorName}</span>
              <BadgeCheck className="size-4 text-brand-deep shrink-0" />
            </div>
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5 mt-0.5">
              <Star className="size-3 fill-coral text-coral" />
              <span className="font-semibold text-ink">{group.tutor_rating ? group.tutor_rating.toFixed(1) : '—'}</span>
              {group.tutor_reviews ? <span>({group.tutor_reviews} reviews)</span> : null}
            </div>
          </div>
          <span className="text-xs text-brand-deep font-semibold shrink-0">View profile →</span>
        </Link>

        {/* Schedule & seats */}
        <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-bold text-ink">Schedule & seats</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <ScheduleRow icon={<Calendar className="size-4 text-brand-deep" />} label="When" value={schedule || 'Schedule TBD'} />
            {nextSession?.duration_minutes && (
              <ScheduleRow icon={<Clock className="size-4 text-brand-deep" />} label="Duration" value={formatDuration(nextSession.duration_minutes)} />
            )}
            <ScheduleRow
              icon={<Users className="size-4 text-brand-deep" />}
              label="Seats"
              value={group.max_students !== null
                ? `${group.enrollment_count ?? 0}/${group.max_students} enrolled${remaining !== null && remaining > 0 && remaining <= 4 ? ` · only ${remaining} left` : ''}`
                : `${group.enrollment_count ?? 0} enrolled`}
            />
            {group.primary_channel && (
              <ScheduleRow icon={<MessageCircle className="size-4 text-brand-deep" />} label="Communication"
                value={group.primary_channel === 'whatsapp' ? 'WhatsApp group' : group.primary_channel === 'classroom' ? 'Google Classroom' : 'iTutor platform'} />
            )}
          </div>
        </section>

        {group.description && (
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-bold text-ink mb-2">About this class</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{group.description}</p>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-bold text-ink mb-3">What's included</h2>
          <ul className="space-y-2 text-sm text-ink">
            {whatsIncluded.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="size-4 text-brand-deep mt-0.5 shrink-0" /><span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Sticky CTA */}
      {!isPending && (() => {
        // ── MONTHLY subscription CTA ──
        if (isMonthly) {
          const monthlyPrice = Number((group as any).price_monthly ?? 0);
          // States that get their own banner (no sticky CTA needed)
          if (subStatus === 'ACTIVATION_FAILED') return null;
          if (subscriptionAccess?.waitlisted) return null;
          if (subStatus === 'GRACE') return null; // handled by banner above
          if (subStatus === 'SUSPENDED') return null; // handled by banner above
          // PENDING_PAYMENT: show "Complete payment" link
          if (subStatus === 'PENDING_PAYMENT' && subscriptionAccess?.pending_payment_expires_at &&
              new Date(subscriptionAccess.pending_payment_expires_at) > new Date()) {
            return (
              <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t border-border p-4">
                <div className="max-w-3xl mx-auto flex items-center gap-4">
                  <div className="flex-1 text-sm text-muted-foreground">Checkout in progress</div>
                  <a href={`/student/subscriptions/${subscriptionAccess.enrollment_id}/pay`}
                    className="px-6 py-3 rounded-2xl text-sm font-semibold bg-brand text-white hover:bg-brand-deep inline-flex items-center gap-2 transition shrink-0">
                    <CreditCard className="size-4" /> Complete payment
                  </a>
                </div>
              </div>
            );
          }
          // Private group without invite
          if (group.visibility === 'private' && (!subscriptionAccess?.subscribed)) {
            return (
              <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t border-border p-4">
                <div className="max-w-3xl mx-auto flex items-center gap-4">
                  <div className="flex-1 text-sm text-muted-foreground">By invitation only</div>
                  <div className="px-6 py-3 rounded-2xl text-sm font-semibold bg-zinc-200 text-zinc-500 inline-flex items-center gap-2 shrink-0 cursor-not-allowed">
                    <Lock className="size-4" /> Invitation required
                  </div>
                </div>
              </div>
            );
          }
          // Default: Subscribe CTA
          const canSubscribe = !subStatus || ['CANCELLED', 'ACTIVATION_FAILED'].includes(subStatus);
          return (
            <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t border-border p-4">
              <div className="max-w-3xl mx-auto flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold text-ink">TT${monthlyPrice}</span>
                    <span className="text-xs text-muted-foreground">/month</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {isFull ? 'Class full — join waitlist' : group.require_join_requests ? 'Approval required' : 'Subscribe instantly'}
                  </div>
                </div>
                <button
                  onClick={handleSubscribe}
                  disabled={subscribing || !canSubscribe}
                  className={cn('px-6 py-3 rounded-2xl text-sm font-semibold inline-flex items-center gap-2 transition shrink-0',
                    !canSubscribe ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed' :
                    isFull ? 'bg-ink text-white hover:bg-ink/90' : 'bg-brand text-white hover:bg-brand-deep')}>
                  {subscribing ? <Loader2 className="size-4 animate-spin" /> : isFull ? <Lock className="size-4" /> : <CreditCard className="size-4" />}
                  {subscribing ? 'Processing…' : isFull ? 'Join waitlist' : `Subscribe — TT$${monthlyPrice}/mo`}
                </button>
              </div>
            </div>
          );
        }
        // ── Non-subscription CTA ──
        return (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t border-border p-4">
            <div className="max-w-3xl mx-auto flex items-center gap-4">
              <div className="flex-1 min-w-0">
                {price > 0 ? (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold text-ink">TT${price}</span>
                    <span className="text-xs text-muted-foreground">{billingLabel}</span>
                  </div>
                ) : (
                  <span className="text-xl font-bold text-brand-deep">Free</span>
                )}
                <div className="text-[11px] text-muted-foreground">{group.require_join_requests ? 'Tutor approval required' : 'Join instantly'}</div>
              </div>
              <button
                onClick={() => setShowJoinModal(true)}
                className={cn('px-6 py-3 rounded-2xl text-sm font-semibold inline-flex items-center gap-2 transition shrink-0',
                  isFull ? 'bg-ink text-white hover:bg-ink/90' : 'bg-brand text-white hover:bg-brand-deep')}>
                {isFull && <Lock className="size-4" />}
                {isFull ? 'Join waitlist' : group.require_join_requests ? 'Request to join' : 'Join class'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Join modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setShowJoinModal(false)}>
          <div className="bg-background w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className={`relative h-20 bg-gradient-to-br ${from} ${to} flex items-center px-5`}>
              <button onClick={() => setShowJoinModal(false)} className="absolute top-3 right-3 size-8 rounded-full bg-white/90 grid place-items-center hover:bg-white">
                <X className="size-4 text-ink" />
              </button>
              <div className="size-10 rounded-xl bg-white grid place-items-center text-2xl shadow-md shrink-0 mr-3">{emoji}</div>
              <div className="min-w-0">
                <div className="font-bold text-white leading-tight truncate">{group.name}</div>
                <div className="text-[11px] text-white/80">by {tutorName}</div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-2xl border border-border p-4 space-y-2 text-sm">
                {[
                  { label: 'Schedule', value: schedule },
                  { label: 'Enrolled', value: group.max_students !== null ? `${group.enrollment_count ?? 0}/${group.max_students}` : `${group.enrollment_count ?? 0} students` },
                  { label: 'Price', value: price > 0 ? `TT$${price}${billingLabel}` : 'Free' },
                ].filter(r => r.value).map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-ink font-medium">{value}</span>
                  </div>
                ))}
              </div>
              {group.require_join_requests && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
                  <ShieldCheck className="size-3.5 mt-0.5 shrink-0 text-amber-600" />
                  The tutor will review your request. You'll be notified once approved.
                </div>
              )}
              <ul className="text-xs text-muted-foreground space-y-1.5">
                <li className="flex items-start gap-2"><Check className="size-3.5 text-brand-deep mt-0.5 shrink-0" /> First session is a free preview.</li>
                <li className="flex items-start gap-2"><Check className="size-3.5 text-brand-deep mt-0.5 shrink-0" /> Cancel anytime — no fees.</li>
              </ul>
              <button onClick={handleJoin} disabled={joining}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-brand text-white font-semibold hover:bg-brand-deep transition disabled:opacity-60">
                {joining ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {joining ? 'Processing…' : group.require_join_requests ? 'Send join request' : `Confirm${price > 0 ? ` — TT$${price}${billingLabel}` : ''}`}
              </button>
              <p className="text-[11px] text-muted-foreground text-center">By continuing you agree to iTutor's Terms of Service.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Class Homepage (enrolled view) ─────────────────────────────── */

type Tab = 'stream' | 'sessions' | 'members';

function ClassHomepage({ group, memberStatus, userId, subscriptionAccess }: { group: Group; memberStatus: MemberStatus; userId: string; subscriptionAccess?: any }) {
  const [tab, setTab] = useState<Tab>('stream');
  const { from, to } = getGradient(group.subject);
  const emoji = getEmoji(group.subject);
  const tutorName = group.tutor?.display_name || group.tutor?.full_name || 'Your Tutor';
  const isSuspended = memberStatus === 'suspended' || memberStatus === 'suspended_payment';
  const isBanned = memberStatus === 'banned' || memberStatus === 'removed' || memberStatus === 'rejected';
  const blocked = isSuspended || isBanned;

  const nextSession = group.upcoming_sessions?.[0];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/student/classes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink transition">
          <ArrowLeft className="size-4" /> My Classes
        </Link>
      </div>

      {/* Banner */}
      <div className={`rounded-3xl p-6 lg:p-8 relative overflow-hidden bg-gradient-to-br ${from} ${to}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex flex-wrap items-start gap-4">
          <div className="text-5xl select-none">{emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-white/70 font-bold">{(group as any).subject_data?.label ?? (group as any).subject_data?.name ?? (group.subject || 'General')} · Group class</div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white mt-1">{group.name}</h1>
            <div className="text-sm text-white/80 mt-1 inline-flex items-center gap-1.5">
              with {tutorName}
              {group.tutor_rating && (
                <>
                  <Star className="size-3.5 fill-amber-400 text-amber-400 ml-1" />
                  <span className="font-semibold text-white">{group.tutor_rating.toFixed(1)}</span>
                </>
              )}
            </div>
          </div>
          {!blocked && nextSession && (
            <a href={nextSession.meeting_link || '#'}
              target={nextSession.meeting_link ? '_blank' : undefined}
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-ink font-semibold text-sm hover:bg-white/90 shrink-0 transition">
              <Video className="size-4" /> Join next session
            </a>
          )}
        </div>
      </div>

      {/* Suspended banner */}
      {isSuspended && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="size-12 rounded-xl bg-amber-100 grid place-items-center shrink-0">
            <ShieldAlert className="size-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-amber-900">Your access is suspended</div>
            <p className="text-sm text-amber-800 mt-0.5">
              <strong>{tutorName}</strong> has paused your access — usually because of an outstanding payment. You can't join sessions or see new posts until you're reactivated.
            </p>
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 shrink-0">
            <CreditCard className="size-4" /> Settle balance
          </button>
        </div>
      )}

      {/* Banned banner */}
      {isBanned && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="size-12 rounded-xl bg-rose-100 grid place-items-center shrink-0">
            <Ban className="size-5 text-rose-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-rose-900">You've been removed from this class</div>
            <p className="text-sm text-rose-800 mt-0.5">
              <strong>{tutorName}</strong> has removed you from <strong>{group.name}</strong>. If you believe this was a mistake, contact iTutor support.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="inline-flex items-center px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700">Contact support</button>
              <Link href="/student/find-tutors" className="inline-flex items-center px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 text-xs font-semibold hover:bg-rose-100">Find another class</Link>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {!blocked && (
        <>
          <div className="border-b border-border flex items-center gap-6 overflow-x-auto">
            {([
              { key: 'stream' as const, label: 'Stream', icon: MessageCircle },
              { key: 'sessions' as const, label: 'Sessions', icon: Calendar },
              { key: 'members' as const, label: 'Members', icon: Users },
            ]).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)}
                className={cn('relative pb-3 text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap transition',
                  tab === key ? 'text-brand-deep' : 'text-muted-foreground hover:text-ink')}>
                <Icon className="size-4" /> {label}
                {tab === key && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-brand" />}
              </button>
            ))}
          </div>
          {tab === 'stream' && <StreamTab groupId={group.id} group={group} tutorName={tutorName} />}
          {tab === 'sessions' && <SessionsTab groupId={group.id} />}
          {tab === 'members' && <MembersTab groupId={group.id} userId={userId} />}
        </>
      )}
    </div>
  );
}

/* ─── Stream Tab ──────────────────────────────────────────────────── */

function StreamTab({ groupId, group, tutorName }: { groupId: string; group: Group; tutorName: string }) {
  const [posts, setPosts] = useState<StreamPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/groups/${groupId}/stream`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const rawPosts: any[] = d.posts ?? d.data ?? [];
        const mapped: StreamPost[] = rawPosts.map((p: any) => ({
          id: p.id,
          kind: p.kind ?? p.type ?? 'announcement',
          title: p.title ?? p.heading ?? null,
          body: p.body ?? p.content ?? null,
          pinned: p.pinned ?? p.is_pinned ?? false,
          created_at: p.created_at ?? p.posted_at,
          attachment_url: p.attachment_url ?? null,
          attachment_name: p.attachment_name ?? p.file_name ?? null,
          link_url: p.link_url ?? p.url ?? null,
        }));
        setPosts(mapped);
      })
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [groupId]);

  const sorted = [...posts].sort((a, b) => (a.pinned ? -1 : 0) - (b.pinned ? -1 : 0));
  const pinned = sorted.filter((p) => p.pinned);

  const kindMeta: Record<string, { icon: any; cls: string; tag: string }> = {
    announcement: { icon: Bell,        cls: 'bg-amber-100 text-amber-700',   tag: 'Announcement' },
    attachment:   { icon: Paperclip,   cls: 'bg-violet-100 text-violet-700', tag: 'Attachment' },
    link:         { icon: LinkIcon,    cls: 'bg-sky-100 text-sky-700',        tag: 'Link' },
  };

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6">
      <div className="space-y-3">
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          The stream is read-only — your tutor posts here. Use Messages to reply.
        </div>

        {loading && (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
          </div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            <MessageCircle className="size-8 mx-auto mb-3 opacity-30" />
            <p>No posts yet. Your tutor will post here.</p>
          </div>
        )}

        {sorted.map((p) => {
          const M = kindMeta[p.kind] ?? kindMeta.announcement;
          const Icon = M.icon;
          return (
            <div key={p.id} className={cn('rounded-2xl bg-card border p-4 flex gap-3', p.pinned ? 'border-coral/40 ring-1 ring-coral/20' : 'border-border')}>
              <div className={cn('size-10 rounded-xl grid place-items-center shrink-0', M.cls)}><Icon className="size-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{M.tag}</span>
                  {p.pinned && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 inline-flex items-center gap-1">
                      <Pin className="size-3" /> Pinned
                    </span>
                  )}
                </div>
                {p.title && <div className="mt-1 font-semibold text-ink">{p.title}</div>}
                {p.body && <p className="text-sm text-muted-foreground mt-1">{p.body}</p>}
                {p.attachment_url && (
                  <a href={p.attachment_url} target="_blank" rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-xs font-semibold text-ink hover:bg-muted">
                    <Download className="size-3.5" /> {p.attachment_name || 'Download attachment'}
                  </a>
                )}
                {p.link_url && (
                  <a href={p.link_url} target="_blank" rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-xs font-semibold text-brand-deep hover:bg-brand-soft">
                    <ExternalLink className="size-3.5" /> {p.link_url}
                  </a>
                )}
                {p.created_at && <div className="mt-2 text-[11px] text-muted-foreground">{timeAgo(p.created_at)}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Class info</div>
          <div className="space-y-2 text-sm">
            {[
              { label: 'Tutor', value: tutorName },
              { label: 'Subject', value: group.subject || '—' },
              { label: 'Format', value: 'Group · weekly' },
              { label: 'Students', value: String(group.enrollment_count ?? '—') },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">{label}</span>
                <span className="text-ink font-medium text-right truncate text-xs">{value}</span>
              </div>
            ))}
          </div>
        </div>
        {pinned.length > 0 && (
          <div className="rounded-2xl bg-card border border-border p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Pinned</div>
            <ul className="space-y-2 text-sm">
              {pinned.map((p) => (
                <li key={p.id} className="flex items-start gap-2">
                  <Pin className="size-3.5 text-orange-500 mt-0.5 shrink-0" />
                  <span className="text-ink line-clamp-2">{p.title || p.body}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ─── Sessions Tab ────────────────────────────────────────────────── */

function SessionsTab({ groupId }: { groupId: string }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/groups/${groupId}/sessions`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const raw: any[] = d.sessions ?? d.data ?? d ?? [];
        const occurrences: any[] = raw.flatMap((s: any) =>
          (s.occurrences ?? [s]).map((o: any) => ({
            id: o.id ?? s.id,
            topic: o.topic ?? s.title ?? s.topic ?? 'Class session',
            scheduled_start_at: o.scheduled_start_at ?? s.scheduled_start_at,
            duration_minutes: o.duration_minutes ?? s.duration_minutes ?? 60,
            meeting_link: o.meeting_link ?? s.meeting_link ?? null,
          }))
        );
        occurrences.sort((a, b) => new Date(b.scheduled_start_at).getTime() - new Date(a.scheduled_start_at).getTime());
        setSessions(occurrences);
      })
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [groupId]);

  if (loading) return <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>;

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        <Calendar className="size-8 mx-auto mb-3 opacity-30" />
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

      {sessions.map((s) => {
        const d = new Date(s.scheduled_start_at);
        const future = d > new Date();
        return (
          <div key={s.id} className="rounded-2xl bg-card border border-border p-4 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-3 md:w-72">
              <div className="text-center bg-brand-soft text-brand-deep rounded-lg px-3 py-1.5 leading-tight shrink-0">
                <div className="text-base font-bold tabular-nums">{d.getDate()}</div>
                <div className="text-[9px] uppercase font-bold tracking-wider">{d.toLocaleString(undefined, { month: 'short' })}</div>
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-ink text-sm truncate">{s.topic}</div>
                <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  {s.duration_minutes && ` · ${formatDuration(s.duration_minutes)}`}
                </div>
              </div>
            </div>
            <div className="flex flex-1 items-center gap-2">
              {future ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-amber-100 text-amber-800">
                  <Clock className="size-3" /> Upcoming
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-muted text-muted-foreground">
                  Past
                </span>
              )}
            </div>
            {future && s.meeting_link && (
              <a href={s.meeting_link} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-deep shrink-0">
                <Video className="size-3.5" /> Join
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Members Tab ─────────────────────────────────────────────────── */

function MembersTab({ groupId, userId }: { groupId: string; userId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/groups/${groupId}/members`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const raw: any[] = d.members ?? d.data ?? [];
        setMembers(raw.map((m: any) => ({
          id: m.id,
          user_id: m.user_id,
          status: m.status,
          joined_at: m.joined_at,
          profile: Array.isArray(m.profile) ? m.profile[0] : m.profile,
          isSelf: m.user_id === userId,
        })));
      })
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [groupId, userId]);

  if (loading) return <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>;

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        <Users className="size-8 mx-auto mb-3 opacity-30" />
        <p>No other members yet.</p>
      </div>
    );
  }

  const sorted = [...members].sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : 0));

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{members.length} student{members.length === 1 ? '' : 's'} in this class</div>
      <div className="grid sm:grid-cols-2 gap-3">
        {sorted.map((m) => {
          const name = m.profile?.full_name || 'Student';
          return (
            <div key={m.id} className={cn('rounded-2xl border bg-card p-4 flex items-center gap-3', m.isSelf ? 'border-brand bg-brand-soft/30' : 'border-border')}>
              <MemberAvatar name={name} size={40} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink text-sm truncate">
                  {name}
                  {m.isSelf && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-deep">(you)</span>}
                </div>
                {m.joined_at && (
                  <div className="text-xs text-muted-foreground">
                    Joined {new Date(m.joined_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
