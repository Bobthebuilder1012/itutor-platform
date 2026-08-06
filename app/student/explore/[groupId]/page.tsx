'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Star, Calendar, Clock, Users, Check, Lock,
  CreditCard, X, Loader2, Sparkles, BadgeCheck,
  MessageSquare, Globe, Flame, BookOpen, ShieldCheck, ChevronRight, CheckCircle2,
  HeartHandshake, Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StarRow } from '@/components/ratings/StarInput';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { formatLevel } from '@/lib/utils/formatLevel';
import { parseScheduleData, scheduleToDisplay, sessionPatternsToDisplay, sessionPatternWeekdays } from '@/lib/utils/scheduleFormat';
import TutorCredentials from '@/components/TutorCredentials';

type Step = 'detail' | 'join' | 'joined' | 'awaiting-approval';

type Occurrence = {
  id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  status: string | null;
  cancelled_at: string | null;
};

type SessionRow = {
  id: string;
  title: string | null;
  duration_minutes: number | null;
  // The tutor's recurrence — the source of truth for "when does this class meet"
  recurrence_type: string | null;
  recurrence_days: number[] | null;
  start_time: string | null;
  starts_on: string | null;
  ends_on: string | null;
  occurrences: Occurrence[];
};

type GroupData = {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  topic: string | null;
  form_level: string | null;
  tutor_id: string;
  price_monthly: number | null;
  price_per_session: number | null;
  max_students: number;
  require_join_requests: boolean;
  feedback_mode: string | null;
  cover_image: string | null;
  schedule_display: string | null;
  schedule_data: string | null;
  session_length_minutes: number | null;
  session_frequency: string | null;
  whatsapp_link: string | null;
  google_classroom_link: string | null;
  average_rating: number | null;
  tutor: { id: string; full_name: string | null; display_name: string | null; avatar_url: string | null; verified: boolean } | null;
  member_count: number;
  enrolled: boolean;
  memberStatus: string | null;
  parent_feedback_price: number | null;
  active_promotion: { id: string; kind: string; discount: number; student_cap: number | null; duration_days: number | null } | null;
  sessions: SessionRow[];
};

type ReviewItem = {
  id: string; rating: number; comment: string | null; reviewer_name: string;
  patience: number | null; explanation: number | null; classMaterial: number | null;
};

type AgendaItem = { id: string; title: string; start: Date; end: Date; durationMin: number; status: 'live' | 'soon' | 'scheduled' };

const GRADIENTS = [
  'from-brand to-emerald-400', 'from-sky-500 to-cyan-400',
  'from-orange-500 to-amber-400', 'from-fuchsia-500 to-purple-500',
  'from-rose-500 to-pink-400', 'from-indigo-500 to-blue-500',
];

function promoLabel(promo: { kind: string; discount: number; student_cap: number | null; duration_days: number | null; created_at?: string; used_count?: number }): string {
  if (promo.kind === 'early-bird' && promo.student_cap) {
    const remaining = promo.student_cap - (promo.used_count ?? 0);
    return `Next ${remaining} student${remaining !== 1 ? 's' : ''} get ${promo.discount}% off`;
  }
  if (promo.kind === 'time-limited' && promo.duration_days && promo.created_at) {
    const exp = new Date(promo.created_at);
    exp.setDate(exp.getDate() + promo.duration_days);
    const daysLeft = Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86400000));
    return `${promo.discount}% off · ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`;
  }
  return `${promo.discount}% off`;
}

function gradientForGroup(name: string): string {
  return GRADIENTS[Math.abs([...name].reduce((a, c) => a + c.charCodeAt(0), 0)) % GRADIENTS.length];
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Full week with the class's recurring days highlighted.
function WeekdayChips({ days }: { days: Set<number> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAY_LABELS.map((label, i) => {
        const on = days.has(i);
        return (
          <span
            key={label}
            aria-label={`${label}${on ? ' (class day)' : ''}`}
            className={cn(
              'inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-full px-2 text-[11px] font-semibold',
              on ? 'bg-brand text-white' : 'bg-muted text-muted-foreground/50'
            )}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

export default function ExploreClassDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { profile, loading: profileLoading } = useProfile();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('detail');
  const [hasLinkedParent, setHasLinkedParent] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    fetchGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  async function fetchGroup() {
    try {
      const res = await fetch(`/api/groups/${groupId}`, { cache: 'no-store' });
      if (!res.ok) { setLoading(false); return; }
      const payload = await res.json();
      const g = payload?.group ?? payload?.data?.group ?? payload;
      if (!g) { setLoading(false); return; }

      const tutorObj = Array.isArray(g.tutor) ? g.tutor[0] : g.tutor;

      // Check enrollment + pending status.
      //
      // Membership has TWO sources and this only consulted one. A paid class
      // is joined by subscribing (group_enrollments), which upserts a
      // group_members row as a side effect — so if that row is missing or
      // stale, a student with a live paid subscription was told to "Request
      // to join" a class they were already paying for. Seen in the wild: an
      // ACTIVE stripe enrollment alongside group_members.status='removed'.
      //
      // A subscription is the stronger signal: it means money is changing
      // hands right now.
      let enrolled = false;
      let memberStatus: string | null = null;
      if (profile?.id) {
        const [{ data: mem }, { data: enr }] = await Promise.all([
          supabase
            .from('group_members')
            .select('status')
            .eq('group_id', groupId)
            .eq('user_id', profile.id)
            .maybeSingle(),
          supabase
            .from('group_enrollments')
            .select('status')
            .eq('group_id', groupId)
            .eq('student_id', profile.id)
            // SUSPENDED included deliberately: they ARE in the class, just
            // access-restricted for non-payment. Offering "Request to join"
            // would be nonsense; the class page explains the suspension.
            .in('status', ['ACTIVE', 'GRACE', 'SUSPENDED'])
            .maybeSingle(),
        ]);
        memberStatus = mem?.status ?? null;
        enrolled =
          !!enr || !!(mem && ['approved', 'active', 'invited'].includes(mem.status));
      }

      // Tutor verification + display name (defensive against schema drift)
      let tutorVerified = false;
      let tutorDisplayName: string | null = null;
      if (tutorObj?.id) {
        try {
          const { data: tp } = await supabase
            .from('profiles')
            .select('display_name, tutor_verification_status')
            .eq('id', tutorObj.id)
            .maybeSingle();
          tutorDisplayName = tp?.display_name ?? null;
          tutorVerified = String(tp?.tutor_verification_status ?? '').toUpperCase() === 'VERIFIED';
        } catch { /* non-fatal */ }
      }

      const sessions: SessionRow[] = Array.isArray(g.sessions)
        ? g.sessions.map((s: any) => ({
            id: s.id,
            title: s.title ?? null,
            duration_minutes: s.duration_minutes ?? null,
            recurrence_type: s.recurrence_type ?? null,
            recurrence_days: Array.isArray(s.recurrence_days) ? s.recurrence_days : null,
            start_time: s.start_time ?? null,
            starts_on: s.starts_on ?? null,
            ends_on: s.ends_on ?? null,
            occurrences: Array.isArray(s.occurrences)
              ? s.occurrences
              : Array.isArray(s.group_session_occurrences)
                ? s.group_session_occurrences
                : [],
          }))
        : [];

      setGroup({
        id: g.id,
        name: g.name,
        description: g.description ?? null,
        subject: g.subject ?? null,
        topic: g.topic ?? null,
        form_level: g.form_level ?? null,
        tutor_id: g.tutor_id,
        price_monthly: g.price_monthly ?? null,
        price_per_session: g.price_per_session ?? null,
        max_students: g.max_students ?? 20,
        require_join_requests: g.require_join_requests ?? false,
        feedback_mode: g.feedback_mode ?? g.parent_feedback_mode ?? null,
        cover_image: g.cover_image ?? null,
        schedule_display: g.schedule_display ?? null,
        schedule_data: g.schedule_data ?? null,
        session_length_minutes: g.session_length_minutes ?? g.key_info?.session_length_minutes ?? null,
        session_frequency: g.session_frequency ?? g.recurrence_type ?? g.key_info?.session_frequency ?? null,
        whatsapp_link: g.whatsapp_link ?? g.whatsapp_url ?? null,
        google_classroom_link: g.google_classroom_link ?? null,
        average_rating: g.average_rating ?? null,
        tutor: tutorObj ? {
          id: tutorObj.id,
          full_name: tutorObj.full_name ?? null,
          display_name: tutorDisplayName ?? tutorObj.display_name ?? tutorObj.full_name ?? null,
          avatar_url: tutorObj.avatar_url ?? null,
          verified: tutorVerified,
        } : null,
        member_count: g.enrollment_count ?? g.member_count ?? 0,
        enrolled,
        memberStatus,
        parent_feedback_price: g.parent_feedback_price ?? null,
        active_promotion: g.active_promotion ?? null,
        sessions,
      });

      // Check if student has a linked parent account
      if (profile?.id) {
        const { data: parentLink } = await supabase
          .from('parent_child_links')
          .select('parent_id')
          .eq('child_id', profile.id)
          .maybeSingle();
        setHasLinkedParent(!!parentLink);
      }
    } catch (err) {
      console.error('[ExploreClassDetail]', err);
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
        <Link href="/student/find-tutors" className="mt-4 inline-block text-brand-deep font-semibold">← Back to explore</Link>
      </div>
    );
  }

  return (
    <>
      <Detail group={group} onJoin={() => setStep('join')} />
      {step !== 'detail' && (
        <Modal onClose={() => setStep('detail')}>
          {step === 'join' && (
            <JoinFlow group={group} onBack={() => setStep('detail')} onSuccess={(s) => setStep(s)} profile={profile} hasLinkedParent={hasLinkedParent} />
          )}
          {step === 'joined' && <JoinedScreen group={group} kind="enrolled" />}
          {step === 'awaiting-approval' && <JoinedScreen group={group} kind="awaiting-approval" />}
        </Modal>
      )}
    </>
  );
}

/* ─── Modal shell ────────────────────────────────────── */

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-h-[92vh] overflow-y-auto rounded-t-3xl border border-border bg-background p-5 shadow-2xl sm:max-w-md sm:rounded-3xl"
      >
        {children}
      </div>
    </div>
  );
}

/* ─── Detail screen ──────────────────────────────────── */

function Detail({ group, onJoin }: { group: GroupData; onJoin: () => void }) {
  const router = useRouter();
  const isPending = group.memberStatus === 'pending';
  const spotsLeft = Math.max(0, group.max_students - group.member_count);
  const isFull = spotsLeft <= 0;
  const isLow = spotsLeft > 0 && spotsLeft <= 3;
  const price = group.price_monthly ?? group.price_per_session ?? 0;
  const promo = group.active_promotion;
  const discountedPrice = promo ? Math.round(price * (1 - promo.discount / 100)) : null;
  const perLabel = group.price_monthly ? 'mo' : 'session';
  const seatsPct = Math.min(100, Math.round((group.member_count / Math.max(1, group.max_students)) * 100));

  const tutorName = group.tutor?.display_name || group.tutor?.full_name || 'Tutor';
  const tutorInitials = tutorName.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').split(' ').map((p) => p[0]).join('').slice(0, 2);

  // Recurring schedule pattern (fallback when a class has no dated occurrences).
  // Tutors set the schedule by adding a recurring session far more often than by
  // filling in the class's own schedule field, so group_sessions comes second
  // only to a hand-written schedule_data.
  const scheduleText = useMemo(() => {
    const entries = parseScheduleData(group.schedule_data);
    if (entries.length) return scheduleToDisplay(entries);
    return sessionPatternsToDisplay(group.sessions) ?? group.schedule_display ?? null;
  }, [group.schedule_data, group.schedule_display, group.sessions]);

  // Real dated agenda from group_sessions occurrences
  const agenda = useMemo(() => buildAgenda(group.sessions), [group.sessions]);
  const nextSession = agenda[0] ?? null;

  // Recurring class days: the weekdays on the tutor's session recurrence, which
  // is what the tutor sees on their own class page. Falls back to the distinct
  // weekdays of upcoming dated occurrences, then to a hand-written schedule_data.
  const recurringDays = useMemo(() => {
    const days = new Set<number>(sessionPatternWeekdays(group.sessions));
    if (days.size === 0) for (const a of agenda) days.add(a.start.getDay());
    if (days.size === 0) {
      for (const e of parseScheduleData(group.schedule_data)) {
        if (typeof e.day === 'number' && e.day >= 0 && e.day <= 6) days.add(e.day);
      }
    }
    return days;
  }, [agenda, group.schedule_data, group.sessions]);

  // Compact "at a glance" from real fields only
  const sessionSummary = useMemo(() => {
    const parts: string[] = [];
    if (group.session_frequency) parts.push(capitalize(String(group.session_frequency)));
    if (group.session_length_minutes) parts.push(`${group.session_length_minutes} min`);
    if (parts.length) return parts.join(' · ');
    return scheduleText ? scheduleText.split('\n')[0] : null;
  }, [group.session_frequency, group.session_length_minutes, scheduleText]);

  const stats: { label: string; value: string }[] = [];
  if (group.form_level) stats.push({ label: 'Level', value: formatLevel(group.form_level) });
  stats.push({ label: 'Seats', value: `${group.member_count}/${group.max_students}` });
  stats.push({ label: 'Billing', value: price > 0 ? (group.price_monthly ? 'Monthly' : 'Per session') : 'Free' });
  if (group.session_length_minutes) stats.push({ label: 'Session', value: `${group.session_length_minutes} min` });
  else stats.push({ label: 'Joining', value: group.require_join_requests ? 'On approval' : 'Instant' });

  const tags = [group.subject, group.form_level ? formatLevel(group.form_level) : null, group.topic]
    .filter((t): t is string => !!t);

  // Reviews (real, deduped API used by the class rating)
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [showAllReviews, setShowAllReviews] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/groups/${group.id}/reviews?limit=50&sortBy=recent`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        const payload = json.data ?? json;
        const items: ReviewItem[] = (payload.items ?? []).map((it: any) => ({
          id: it.id,
          rating: Number(it.rating) || 0,
          comment: it.comment ?? null,
          reviewer_name: it.reviewer?.full_name ?? 'Student',
          patience: it.patience_rating ?? null,
          explanation: it.explanation_rating ?? null,
          classMaterial: it.class_material_rating ?? null,
        }));
        setReviews(items);
        setReviewTotal(payload.pagination?.total ?? items.length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [group.id]);

  const computedAvg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const ratingAvg = group.average_rating && group.average_rating > 0 ? group.average_rating : computedAvg;
  const hasRatings = reviewTotal > 0 && ratingAvg > 0;
  const shownReviews = showAllReviews ? reviews : reviews.slice(0, 4);

  // 3-category breakdown (only reviews carrying all three sub-scores).
  const categoryReviews = reviews.filter((r) => r.patience != null && r.explanation != null && r.classMaterial != null);
  const catAvg = (key: 'patience' | 'explanation' | 'classMaterial') =>
    categoryReviews.length ? categoryReviews.reduce((s, r) => s + (r[key] ?? 0), 0) / categoryReviews.length : 0;
  const categoryCards = [
    { label: 'Patience', icon: HeartHandshake, value: catAvg('patience') },
    { label: 'Explanation', icon: Lightbulb, value: catAvg('explanation') },
    { label: 'Class material', icon: BookOpen, value: catAvg('classMaterial') },
  ];

  const ctaLabel = group.enrolled ? 'Open class'
    : isPending ? 'Request pending'
    : isFull ? 'Join waitlist'
    : group.require_join_requests ? 'Request to join'
    : 'Join class';
  const ctaCaption = group.enrolled ? "You're enrolled"
    : isPending ? 'Awaiting tutor approval'
    : isFull ? 'Class full · join the waitlist'
    : group.require_join_requests ? 'Tutor approval required'
    : 'Join instantly · cancel anytime';

  const handleCta = () => {
    if (group.enrolled) { router.push(`/student/classes/${group.id}`); return; }
    if (!isPending) onJoin();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-44 sm:pb-28">
      <Link href="/student/find-tutors" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-brand-deep">
        <ArrowLeft className="size-3.5" /> All classes
      </Link>

      {isPending && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <div className="size-8 rounded-lg bg-amber-100 grid place-items-center shrink-0">
            <Clock className="size-4 text-amber-700" />
          </div>
          <div>
            <div className="font-semibold text-amber-900 text-sm">Request pending</div>
            <p className="text-xs text-amber-700 mt-0.5">
              Your request to join is waiting for the tutor's approval. You'll get a notification once they respond. Requests expire after 48 hours if unanswered.
            </p>
          </div>
        </div>
      )}

      {/* Hero header with primary action */}
      <section className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-brand to-brand-deep text-white shadow-[0_20px_50px_-30px_rgba(16,120,70,0.7)]">
        {group.cover_image && (
          // Banners are authored 4:1 on light washes (lib/utils/bannerCanvas.ts),
          // so they get their own strip above the hero rather than sitting behind
          // it — a scrim dark enough to carry white type would bury the artwork.
          // Classes with no banner keep the plain brand gradient.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={group.cover_image}
            alt=""
            className="block w-full object-cover"
            style={{ aspectRatio: '4 / 1' }}
          />
        )}
        <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
              {group.subject && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 backdrop-blur">
                  <BookOpen className="size-3" /> {group.subject}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 backdrop-blur">
                <Users className="size-3" /> Group class
              </span>
              {promo ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-1 text-amber-900 backdrop-blur">
                  🏷 {promoLabel(promo)}
                </span>
              ) : isLow ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-coral-soft/25 px-2 py-1 text-white backdrop-blur">
                  <Flame className="size-3" /> {spotsLeft} seats left
                </span>
              ) : !isFull ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 backdrop-blur">
                  <Sparkles className="size-3" /> {spotsLeft} seats left
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 backdrop-blur">Class full</span>
              )}
            </div>

            <h1 className="mt-2 text-2xl font-black leading-tight tracking-tight sm:text-3xl">{group.name}</h1>
            {group.description && (
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/85 line-clamp-3">{group.description}</p>
            )}

            {/* Tutor row */}
            {group.tutor && (
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <Link href={`/student/tutors/${group.tutor.id}`} className="flex items-center gap-2 hover:opacity-90">
                  {group.tutor.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={group.tutor.avatar_url} alt={tutorName} className="size-8 rounded-full object-cover ring-2 ring-white/40" />
                  ) : (
                    <div className="size-8 rounded-full bg-white/20 grid place-items-center text-[11px] font-bold ring-2 ring-white/40">{tutorInitials}</div>
                  )}
                  <div className="leading-tight">
                    <div className="flex items-center gap-1 font-semibold">
                      {tutorName}
                      {group.tutor.verified && <BadgeCheck className="size-3.5 text-mint" />}
                    </div>
                    <div className="text-[10px] text-white/70">View profile</div>
                  </div>
                </Link>
                {hasRatings && (
                  <div className="flex items-center gap-1 text-white/85">
                    <Star className="size-3.5 fill-coral text-coral" />
                    <span className="font-semibold">{ratingAvg.toFixed(1)}</span>
                    <span className="text-white/70">({reviewTotal})</span>
                  </div>
                )}
                {sessionSummary && (
                  <div className="flex items-center gap-1 text-white/85">
                    <Clock className="size-3.5" /> {sessionSummary}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Primary action block — desktop (mobile uses the sticky bar) */}
          <div className="hidden lg:block rounded-2xl bg-background p-4 text-ink shadow-lg lg:min-w-[260px]">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-2xl font-black tracking-tight">
                  {price > 0 ? (
                    discountedPrice !== null ? (
                      <span className="flex items-baseline gap-1.5">
                        {fmtTTD(discountedPrice)}
                        <span className="text-sm font-semibold line-through text-muted-foreground">{fmtTTD(price)}</span>
                      </span>
                    ) : (
                      fmtTTD(price)
                    )
                  ) : (
                    <span className="text-brand-deep">Free</span>
                  )}
                  {price > 0 && <span className="text-xs font-semibold text-muted-foreground">/{perLabel}</span>}
                </div>
                <div className="text-[11px] text-muted-foreground">{ctaCaption}</div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-deep">
                <ShieldCheck className="size-3" /> Secure
              </span>
            </div>
            <button
              onClick={handleCta}
              disabled={isPending}
              className={cn(
                'mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition disabled:opacity-60 disabled:cursor-not-allowed',
                group.enrolled ? 'bg-brand text-white hover:bg-brand-deep'
                  : isFull ? 'bg-ink text-white hover:opacity-90'
                  : 'bg-brand text-white shadow-[0_8px_20px_-8px_rgba(16,120,70,0.8)] hover:bg-brand-deep'
              )}
            >
              {group.enrolled ? <CheckCircle2 className="size-4" /> : isFull && !isPending ? <Lock className="size-4" /> : null}
              {ctaLabel}
              {!group.enrolled && !isPending && !isFull && <ChevronRight className="size-4" />}
            </button>
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{group.member_count}/{group.max_students} enrolled</span>
              {nextSession && <span>Starts {formatShort(nextSession.start)}</span>}
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
              <div className={cn('h-full rounded-full', isLow ? 'bg-coral' : 'bg-brand')} style={{ width: `${seatsPct}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* Main grid */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* LEFT column */}
        <div className="flex flex-col gap-4">
          {/* About + at-a-glance */}
          <section className="rounded-3xl border border-border bg-background p-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-ink">About this class</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {group.description || 'The tutor has not added a description for this class yet.'}
                </p>
                {tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <span key={t} className="rounded-full bg-mint px-2.5 py-1 text-[11px] font-semibold text-brand-deep">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 md:min-w-[240px]">
                {stats.slice(0, 4).map((s) => <MiniStat key={s.label} label={s.label} value={s.value} />)}
              </div>
            </div>
          </section>

          {/* Class channels — info only until enrolled */}
          {(group.whatsapp_link || group.google_classroom_link) && (
            <section className="rounded-3xl border border-border bg-background p-5 space-y-3">
              <h3 className="text-base font-bold text-ink">Class channels</h3>
              {group.enrolled ? (
                <>
                  <p className="text-xs text-muted-foreground">Join your tutor's external channels for announcements and materials.</p>
                  <div className="flex flex-wrap gap-2">
                    {group.whatsapp_link && (
                      <a href={group.whatsapp_link} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#25D366] text-white text-sm font-semibold hover:opacity-90">
                        <MessageSquare className="size-4" /> WhatsApp group
                      </a>
                    )}
                    {group.google_classroom_link && (
                      <a href={group.google_classroom_link} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-ink text-white text-sm font-semibold hover:opacity-90">
                        <Globe className="size-4" /> Google Classroom
                      </a>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="size-8 rounded-lg bg-muted grid place-items-center shrink-0">
                    {group.whatsapp_link && !group.google_classroom_link
                      ? <MessageSquare className="size-4 text-muted-foreground" />
                      : <Globe className="size-4 text-muted-foreground" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">
                      This class uses {[group.whatsapp_link && 'WhatsApp', group.google_classroom_link && 'Google Classroom'].filter(Boolean).join(' and ')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Join the class to access the group link.</p>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Tutor */}
          {group.tutor && (
            <section className="rounded-3xl border border-border bg-background p-5">
              <div className="flex items-start gap-4">
                {group.tutor.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={group.tutor.avatar_url} alt={tutorName} className="size-14 shrink-0 rounded-2xl object-cover" />
                ) : (
                  <div className="size-14 shrink-0 rounded-2xl bg-gradient-to-br from-brand to-emerald-400 grid place-items-center text-white font-bold">{tutorInitials}</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-ink">{tutorName}</h3>
                    {group.tutor.verified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-deep">
                        <BadgeCheck className="size-3" /> Verified
                      </span>
                    )}
                  </div>
                  {hasRatings && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="size-3 fill-coral text-coral" />
                      <span className="font-semibold text-ink">{ratingAvg.toFixed(1)}</span>
                      <span>· {reviewTotal} review{reviewTotal !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
                <Link href={`/student/tutors/${group.tutor.id}`}
                  className="hidden shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-ink transition hover:bg-mint sm:inline-flex">
                  View profile
                </Link>
              </div>
            </section>
          )}

          {/* Reviews */}
          <section className="rounded-3xl border border-border bg-background p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-ink">Ratings &amp; reviews</h3>
                {hasRatings ? (
                  <div className="mt-0.5 flex items-center gap-1 text-xs">
                    <Star className="size-3.5 fill-coral text-coral" />
                    <span className="font-semibold text-ink">{ratingAvg.toFixed(1)}</span>
                    <span className="text-muted-foreground">· {reviewTotal} review{reviewTotal !== 1 ? 's' : ''}</span>
                  </div>
                ) : (
                  <div className="mt-0.5 text-xs text-muted-foreground">No reviews yet</div>
                )}
              </div>
              {reviews.length > 4 && (
                <button onClick={() => setShowAllReviews((v) => !v)} className="text-xs font-medium text-brand-deep hover:underline">
                  {showAllReviews ? 'Show less' : 'See all'}
                </button>
              )}
            </div>
            {categoryReviews.length > 0 && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {categoryCards.map((c) => {
                  const Icon = c.icon;
                  return (
                    <div key={c.label} className="rounded-2xl border border-border bg-muted/50 p-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                        <span className="size-6 rounded-lg bg-brand/10 text-brand-deep grid place-items-center"><Icon className="size-3.5" /></span>
                        {c.label}
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-lg font-bold text-ink tabular-nums">{c.value.toFixed(1)}</span>
                        <StarRow value={c.value} size={12} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {reviews.length > 0 && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {shownReviews.map((r) => (
                  <div key={r.id} className="rounded-2xl bg-muted p-3">
                    <div className="flex items-center gap-1 text-xs">
                      {Array.from({ length: Math.max(0, Math.min(5, r.rating)) }).map((_, i) => (
                        <Star key={i} className="size-3 fill-coral text-coral" />
                      ))}
                      <span className="ml-1 font-semibold text-ink">{firstName(r.reviewer_name)}</span>
                    </div>
                    {r.comment && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT column — schedule */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          {recurringDays.size > 0 && (
            <div className="rounded-3xl border border-border bg-background p-4">
              <div className="flex items-center gap-1.5">
                <Calendar className="size-4 text-brand-deep" />
                <h3 className="text-sm font-bold text-ink">Meets on</h3>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Recurring class days</p>
              <div className="mt-2.5">
                <WeekdayChips days={recurringDays} />
              </div>
            </div>
          )}

          {nextSession ? (
            <div className="overflow-hidden rounded-3xl border border-brand/40 bg-background">
              <div className="flex items-center justify-between bg-brand-soft px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-brand-deep">
                <span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5" /> Next class</span>
                <StatusPill status={nextSession.status} />
              </div>
              <div className="p-4">
                <h4 className="text-sm font-bold text-ink">{nextSession.title}</h4>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Calendar className="size-3.5" /> {formatFull(nextSession.start)}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> {formatTimeRange(nextSession.start, nextSession.durationMin)}</span>
                </div>
                {group.enrolled ? (
                  <Link href={`/student/classes/${group.id}`}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
                    Open class
                  </Link>
                ) : (
                  <button onClick={handleCta} disabled={isPending}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:opacity-60">
                    {isFull ? 'Join the waitlist' : group.require_join_requests ? 'Request to attend' : 'Enrol to attend'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-background p-4">
              <h3 className="text-sm font-bold text-ink">Schedule</h3>
              {scheduleText ? (
                <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{scheduleText}</p>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">Schedule to be announced by the tutor.</p>
              )}
            </div>
          )}

          {/* Upcoming schedule agenda */}
          {agenda.length > 0 && (
            <div className="rounded-3xl border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <h3 className="text-sm font-bold text-ink">Upcoming classes</h3>
                  <p className="text-[11px] text-muted-foreground">Your local time · {tzLabel()}</p>
                </div>
              </div>
              <ul className="divide-y divide-border">
                {agenda.slice(0, 6).map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <DateBadge date={s.start} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-semibold text-ink">{s.title}</p>
                        <StatusPill status={s.status} compact />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {formatTimeRange(s.start, s.durationMin)} · {relativeTime(s.start)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Mobile sticky action bar */}
      <div className="fixed bottom-[4.5rem] left-0 right-0 z-40 border-t border-border bg-background/95 px-3 py-2 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-bold text-ink">
              {price > 0 ? (
                <>
                  {fmtTTD(discountedPrice ?? price)}
                  <span className="text-[10px] font-medium text-muted-foreground">/{perLabel}</span>
                </>
              ) : (
                <span className="text-brand-deep">Free</span>
              )}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">{ctaCaption}</div>
          </div>
          <button
            onClick={handleCta}
            disabled={isPending}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-2xl px-5 py-2.5 text-sm font-bold transition disabled:opacity-60 disabled:cursor-not-allowed',
              group.enrolled ? 'bg-brand text-white hover:bg-brand-deep'
                : isFull ? 'bg-ink text-white hover:opacity-90'
                : 'bg-brand text-white hover:bg-brand-deep'
            )}
          >
            {group.enrolled && <CheckCircle2 className="size-4" />}
            {isFull && !group.enrolled && !isPending && <Lock className="size-4" />}
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Small presentational pieces ────────────────────── */

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-mint/40 px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xs font-bold text-ink">{value}</div>
    </div>
  );
}

function DateBadge({ date }: { date: Date }) {
  return (
    <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-border bg-background text-center leading-tight">
      <div>
        <div className="text-[9px] font-bold uppercase text-brand-deep">{date.toLocaleDateString(undefined, { month: 'short' })}</div>
        <div className="text-sm font-black text-ink">{date.getDate()}</div>
      </div>
    </div>
  );
}

function StatusPill({ status, compact = false }: { status: AgendaItem['status']; compact?: boolean }) {
  const map: Record<AgendaItem['status'], { label: string; cls: string }> = {
    live: { label: 'Live now', cls: 'bg-coral text-white' },
    soon: { label: 'Starting soon', cls: 'bg-peach text-amber-800' },
    scheduled: { label: 'Scheduled', cls: 'bg-mint text-brand-deep' },
  };
  const { label, cls } = map[status];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full font-semibold', compact ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-[10px]', cls)}>
      {status === 'live' && <span className="size-1.5 animate-pulse rounded-full bg-white" />}
      {label}
    </span>
  );
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
        <div className="text-sm text-ink font-medium">{children}</div>
      </div>
    </div>
  );
}

/* ─── Join flow ──────────────────────────────────────── */

function JoinFlow({ group, onBack, onSuccess, profile, hasLinkedParent }: {
  group: GroupData;
  onBack: () => void;
  onSuccess: (step: Step) => void;
  profile: any;
  hasLinkedParent: boolean;
}) {
  const isFull = group.max_students - group.member_count <= 0;
  const isRequest = group.require_join_requests;
  const price = group.price_monthly ?? group.price_per_session ?? 0;
  const promo = group.active_promotion;
  const discountedPrice = promo ? Math.round(price * (1 - promo.discount / 100)) : null;
  const effectivePrice = discountedPrice ?? price;
  const hasFeedbackAddon = false; // parent accounts coming soon
  const [wantsFeedback, setWantsFeedback] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const totalPrice = effectivePrice + (wantsFeedback && hasFeedbackAddon ? (group.parent_feedback_price ?? 0) : 0);
  const feedbackDecisionRequired = hasFeedbackAddon && hasLinkedParent && wantsFeedback === null;
  const [err, setErr] = useState('');

  const heading = isFull ? 'Join the waitlist'
    : isRequest ? 'Request to join'
    : 'Confirm your enrolment';

  const confirmLabel = isFull ? 'Add me to the waitlist'
    : isRequest ? 'Send request to tutor'
    : 'Confirm & join class';

  const handleConfirm = async () => {
    if (!profile?.id) return;
    setSubmitting(true); setErr('');
    try {
      if (price > 0 && !isFull) {
        const res = await fetch(`/api/groups/${group.id}/subscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (data.checkout_url) { window.location.href = data.checkout_url; return; }
        if (data.waitlisted) { onSuccess('awaiting-approval'); return; }
        if (res.status === 503) throw new Error('Online payments are not available right now. Please contact the tutor directly.');
        if (!res.ok) throw new Error(data.detail ? `${data.error}: ${data.detail}` : (data.error || 'Failed to process enrolment. Please try again.'));
      } else {
        const res = await fetch(`/api/groups/${group.id}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to join');
        const status = data.member?.status;
        if (status === 'pending_approval' || status === 'pending' || isRequest) {
          onSuccess('awaiting-approval');
        } else {
          onSuccess('joined');
        }
        return;
      }
      onSuccess('joined');
    } catch (e: any) {
      setErr(e?.message ?? 'Failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
          <ArrowLeft className="size-4" /> Back
        </button>
        <h1 className="font-bold text-ink">{heading}</h1>
        <button onClick={onBack} aria-label="Close" className="size-8 grid place-items-center rounded-full hover:bg-muted text-muted-foreground">
          <X className="size-4" />
        </button>
      </div>

      <ClassSummaryCard group={group} />

      <section className="rounded-2xl border border-border bg-background p-5 space-y-3">
        <h2 className="font-bold text-ink text-sm">Billing</h2>
        <InfoRow icon={<CreditCard className="size-4 text-brand-deep" />} label="Model">
          {price > 0
            ? group.price_monthly ? 'Monthly subscription' : 'Per-session billing'
            : 'Free — no payment required'}
        </InfoRow>
        {price > 0 && (
          <>
            {promo && discountedPrice !== null && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                <span className="text-xs font-bold text-amber-700">🏷 {promo.discount}% off applied</span>
                <span className="text-xs text-muted-foreground line-through">{fmtTTD(price)}</span>
                <span className="text-xs font-bold text-brand-deep">→ {fmtTTD(discountedPrice)}/mo</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground leading-relaxed">
              You'll be charged {fmtTTD(totalPrice)}{group.price_monthly ? ' each month' : ' per session'}. Cancel any time from your account.
            </p>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-background p-5 space-y-2">
        <h2 className="font-bold text-ink text-sm">Terms</h2>
        <ul className="text-xs text-muted-foreground space-y-2">
          <li className="flex items-start gap-2"><Check className="size-3.5 text-brand-deep mt-0.5 shrink-0" /> You can cancel any time from your account.</li>
          {isRequest && <li className="flex items-start gap-2"><Check className="size-3.5 text-brand-deep mt-0.5 shrink-0" /> The tutor will review your request and respond within 48 hours.</li>}
          {isFull && <li className="flex items-start gap-2"><Check className="size-3.5 text-brand-deep mt-0.5 shrink-0" /> You'll be notified the moment a seat opens — no obligation.</li>}
          <li className="flex items-start gap-2"><Check className="size-3.5 text-brand-deep mt-0.5 shrink-0" /> By joining you agree to iTutor's Terms of Service.</li>
        </ul>
      </section>

      {feedbackDecisionRequired && (
        <p className="text-xs text-amber-700 text-center font-medium">Please choose whether to add parent feedback above before continuing.</p>
      )}
      {err && <p className="text-xs text-rose-600 text-center">{err}</p>}

      <button
        onClick={handleConfirm}
        disabled={submitting || feedbackDecisionRequired}
        className="block w-full text-center px-5 py-3 rounded-2xl bg-brand text-white font-semibold hover:bg-brand-deep disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? <span className="inline-flex items-center gap-2 justify-center"><Loader2 className="size-4 animate-spin" /> Processing…</span> : confirmLabel}
      </button>
    </div>
  );
}

/* ─── Success screens ────────────────────────────────── */

function JoinedScreen({ group, kind }: { group: GroupData; kind: 'enrolled' | 'awaiting-approval' }) {
  const copy = {
    enrolled: {
      icon: <Check className="size-6 text-white" />,
      tone: 'bg-brand',
      title: "You're enrolled!",
      body: "You've been added to the class. Check your class page for the stream and upcoming sessions.",
      next: 'Go to my class',
      href: `/student/classes/${group.id}`,
    },
    'awaiting-approval': {
      icon: <Loader2 className="size-6 text-white animate-spin" />,
      tone: 'bg-amber-500',
      title: 'Request sent!',
      body: `${group.tutor?.display_name || group.tutor?.full_name || 'The tutor'} typically responds within 48 hours. You'll get a notification when they approve.`,
      next: 'Back to explore',
      href: '/student/find-tutors',
    },
  }[kind];

  return (
    <div className="space-y-5 text-center">
      <div className={cn('mx-auto mt-2 size-14 rounded-2xl grid place-items-center', copy.tone)}>{copy.icon}</div>
      <div>
        <h1 className="text-2xl font-bold text-ink">{copy.title}</h1>
        <p className="text-sm text-muted-foreground mt-2">{copy.body}</p>
      </div>
      <div className="rounded-2xl border border-border bg-background p-4">
        <ClassSummaryCard group={group} />
      </div>
      <Link href={copy.href} className="inline-block px-5 py-3 rounded-2xl bg-ink text-white font-semibold hover:opacity-90">
        {copy.next}
      </Link>
    </div>
  );
}

function ClassSummaryCard({ group }: { group: GroupData }) {
  const gradient = gradientForGroup(group.name);
  const price = group.price_monthly ?? group.price_per_session ?? 0;
  const promo = group.active_promotion;
  const discountedPrice = promo ? Math.round(price * (1 - promo.discount / 100)) : null;
  const tutorName = group.tutor?.display_name || group.tutor?.full_name || 'Tutor';
  const schedule = (() => {
    const entries = parseScheduleData(group.schedule_data);
    if (entries.length) return scheduleToDisplay(entries);
    return sessionPatternsToDisplay(group.sessions) ?? group.schedule_display ?? null;
  })();

  return (
    <div className="flex items-start gap-3">
      <div className={cn('size-12 rounded-2xl grid place-items-center text-2xl shrink-0 bg-gradient-to-br mt-0.5', gradient)}>📚</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ink">{group.name}</div>
        <div className="text-xs text-muted-foreground">by {tutorName}</div>
        {group.tutor?.id && <TutorCredentials tutorId={group.tutor.id} variant="compact" className="mt-1" />}
        {schedule && (
          <div className="text-xs text-muted-foreground mt-1 whitespace-pre-line leading-relaxed">{schedule}</div>
        )}
      </div>
      <div className="text-right shrink-0">
        {price > 0 ? (
          discountedPrice !== null ? (
            <>
              <div className="font-bold text-brand-deep">{fmtTTD(discountedPrice)}</div>
              <div className="text-[11px] line-through text-muted-foreground">{fmtTTD(price)}</div>
              <div className="text-[11px] text-muted-foreground">/{group.price_monthly ? 'mo' : 'session'}</div>
            </>
          ) : (
            <><div className="font-bold text-ink">{fmtTTD(price)}</div><div className="text-[11px] text-muted-foreground">/{group.price_monthly ? 'mo' : 'session'}</div></>
          )
        ) : (
          <div className="font-bold text-brand-deep">Free</div>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────── */

function buildAgenda(sessions: SessionRow[]): AgendaItem[] {
  const now = Date.now();
  const items: AgendaItem[] = [];
  for (const s of sessions ?? []) {
    for (const o of s.occurrences ?? []) {
      if (o.cancelled_at) continue;
      const start = new Date(o.scheduled_start_at);
      const end = new Date(o.scheduled_end_at);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      if (end.getTime() < now) continue; // upcoming + in-progress only
      const ms = start.getTime() - now;
      let status: AgendaItem['status'] = 'scheduled';
      if (now >= start.getTime() && now <= end.getTime()) status = 'live';
      else if (ms > 0 && ms <= 30 * 60_000) status = 'soon';
      const durationMin = s.duration_minutes ?? Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000)) ?? 60;
      items.push({ id: o.id, title: s.title ?? 'Class session', start, end, durationMin, status });
    }
  }
  return items.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

function firstName(name: string) {
  const cleaned = name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').trim();
  const parts = cleaned.split(/\s+/);
  return parts[0] || 'Student';
}

function formatShort(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatFull(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}
function formatTimeRange(d: Date, mins: number) {
  const end = new Date(d.getTime() + mins * 60_000);
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${d.toLocaleTimeString(undefined, opts)} – ${end.toLocaleTimeString(undefined, opts)}`;
}
function relativeTime(d: Date) {
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const min = Math.round(diff / 60_000);
  const hr = Math.round(diff / 3_600_000);
  const day = Math.round(diff / 86_400_000);
  if (abs < 60 * 60_000) return min >= 0 ? `in ${min}m` : `${-min}m ago`;
  if (abs < 24 * 3_600_000) return hr >= 0 ? `in ${hr}h` : `${-hr}h ago`;
  return day >= 0 ? `in ${day}d` : `${-day}d ago`;
}
function tzLabel() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'local time';
  }
}
