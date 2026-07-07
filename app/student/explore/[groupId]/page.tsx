'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Star, CalendarDays, Users, Check, Lock, Clock,
  CreditCard, X, Loader2, Sparkles, BadgeCheck,
  MessageSquare, Globe, Flame, Share2, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { formatLevel } from '@/lib/utils/formatLevel';
import { parseScheduleData, scheduleToDisplay } from '@/lib/utils/scheduleFormat';
import { RatingBreakdown, type RatingSummary } from '@/components/ratings/RatingBreakdown';
import { CommentSection } from '@/components/ratings/CommentSection';

type Step = 'detail' | 'join' | 'joined' | 'awaiting-approval';

type GroupData = {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  form_level: string | null;
  tutor_id: string;
  price_monthly: number | null;
  price_per_session: number | null;
  price_per_course: number | null;
  session_length_minutes: number | null;
  goals: string | null;
  sessions: Array<{ id: string; title: string | null; recurrence_days: string[] | null; start_time: number | null; duration_minutes: number | null; recurrence_type: string | null }>;
  max_students: number;
  require_join_requests: boolean;
  feedback_mode: string | null;
  cover_image: string | null;
  schedule_display: string | null;
  schedule_data: string | null;
  whatsapp_link: string | null;
  google_classroom_link: string | null;
  average_rating: number | null;
  tutor: { id: string; full_name: string | null; display_name: string | null; avatar_url: string | null; rating_average: number | null; rating_count: number | null } | null;
  member_count: number;
  enrolled: boolean;
  memberStatus: string | null;
  parent_feedback_price: number | null;
  active_promotion: { id: string; kind: string; discount: number; student_cap: number | null; duration_days: number | null } | null;
  other_classes_by_tutor: Array<{ id: string; name: string; subject: string | null; cover_image: string | null; form_level: string | null; price_monthly: number | null; price_per_session: number | null; max_students: number | null; member_count: number; average_rating: number; total_reviews: number }>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0x7fffffff;
  return h % 360;
}

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExploreClassDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const router = useRouter();
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

      let enrolled = false;
      let memberStatus: string | null = null;
      if (profile?.id) {
        const { data: mem } = await supabase
          .from('group_members')
          .select('status')
          .eq('group_id', groupId)
          .eq('user_id', profile.id)
          .maybeSingle();
        memberStatus = mem?.status ?? null;
        enrolled = !!(mem && ['approved', 'active', 'invited'].includes(mem.status));
      }

      setGroup({
        id: g.id,
        name: g.name,
        description: g.description ?? null,
        subject: g.subject ?? null,
        form_level: g.form_level ?? null,
        tutor_id: g.tutor_id,
        price_monthly: g.price_monthly ?? null,
        price_per_session: g.price_per_session ?? null,
        price_per_course: g.price_per_course ?? null,
        session_length_minutes: g.session_length_minutes ?? g.key_info?.session_length_minutes ?? null,
        goals: g.goals ?? null,
        sessions: (g.sessions ?? []).map((s: any) => ({
          id: s.id,
          title: s.title ?? null,
          recurrence_days: s.recurrence_days ?? null,
          start_time: s.start_time ?? null,
          duration_minutes: s.duration_minutes ?? null,
          recurrence_type: s.recurrence_type ?? null,
        })),
        max_students: g.max_students ?? 20,
        require_join_requests: g.require_join_requests ?? false,
        feedback_mode: g.feedback_mode ?? g.parent_feedback_mode ?? null,
        cover_image: g.cover_image ?? null,
        schedule_display: g.schedule_display ?? null,
        schedule_data: g.schedule_data ?? null,
        whatsapp_link: g.whatsapp_link ?? g.whatsapp_url ?? null,
        google_classroom_link: g.google_classroom_link ?? null,
        average_rating: g.average_rating ?? null,
        tutor: tutorObj ? {
          id: tutorObj.id,
          full_name: tutorObj.full_name ?? null,
          display_name: tutorObj.display_name ?? tutorObj.full_name ?? null,
          avatar_url: tutorObj.avatar_url ?? null,
          rating_average: tutorObj.rating_average ?? null,
          rating_count: tutorObj.rating_count ?? null,
        } : null,
        member_count: g.enrollment_count ?? g.member_count ?? 0,
        enrolled,
        memberStatus,
        parent_feedback_price: g.parent_feedback_price ?? null,
        active_promotion: g.active_promotion ?? null,
        other_classes_by_tutor: (g.other_classes_by_tutor ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          subject: c.subject ?? null,
          cover_image: c.cover_image ?? null,
          form_level: c.form_level ?? null,
          price_monthly: c.price_monthly ?? null,
          price_per_session: c.price_per_session ?? null,
          max_students: c.max_students ?? null,
          member_count: c.member_count ?? 0,
          average_rating: c.average_rating ?? 0,
          total_reviews: c.total_reviews ?? 0,
        })),
      });

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
    return (
      <div className="flex justify-center py-32">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <h1 className="text-2xl font-bold text-ink">Class not found</h1>
        <Link href="/student/find-tutors" className="mt-4 inline-block text-brand-deep font-semibold">← Back to explore</Link>
      </div>
    );
  }

  if (step === 'join') return <JoinFlow group={group} onBack={() => setStep('detail')} onSuccess={(s) => setStep(s)} profile={profile} hasLinkedParent={hasLinkedParent} />;
  if (step === 'joined') return <JoinedScreen group={group} kind="enrolled" />;
  if (step === 'awaiting-approval') return <JoinedScreen group={group} kind="awaiting-approval" />;
  return <Detail group={group} onJoin={() => setStep('join')} />;
}

// ── Detail screen ─────────────────────────────────────────────────────────────

function StatTile({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="p-4 border-r last:border-r-0 border-b sm:border-b-0 border-border">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <Icon className="size-4 text-ink/60" />
        <span className="text-base font-bold text-ink">{value}</span>
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Detail({ group, onJoin }: { group: GroupData; onJoin: () => void }) {
  const isPending = group.memberStatus === 'pending';
  const spotsLeft = group.max_students - group.member_count;
  const isFull = spotsLeft <= 0;
  const isLow = spotsLeft > 0 && spotsLeft <= 3;
  const price = group.price_monthly ?? group.price_per_session ?? group.price_per_course ?? 0;
  const promo = group.active_promotion;
  const discountedPrice = promo ? Math.round(price * (1 - promo.discount / 100)) : null;
  const effectivePrice = discountedPrice ?? price;
  const hue = hashHue(group.id);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [ratingSummary, setRatingSummary] = useState<RatingSummary>({
    average: 0, total: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });

  useEffect(() => {
    fetch(`/api/groups/${group.id}/reviews?limit=100`)
      .then(r => r.ok ? r.json() : { data: { items: [] } })
      .then(json => {
        const items: any[] = json.data?.items ?? json.items ?? [];
        const dist: Record<1|2|3|4|5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        items.forEach(r => { const s = r.rating as 1|2|3|4|5; if (s >= 1 && s <= 5) dist[s]++; });
        const total = items.length;
        const average = total ? items.reduce((s, r) => s + r.rating, 0) / total : 0;
        setRatingSummary({ average, total, dist });
      })
      .catch(() => {});
  }, [group.id]);

  const tutorName = group.tutor?.display_name || group.tutor?.full_name || 'Tutor';
  const tutorInitials = tutorName.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();

  const schedule = (() => {
    const entries = parseScheduleData(group.schedule_data);
    if (entries.length) return scheduleToDisplay(entries);
    return group.schedule_display || null;
  })();

  const firstSession = group.sessions?.[0] ?? null;
  const sessionLengthMins = group.session_length_minutes ?? firstSession?.duration_minutes ?? null;
  const sessionLengthLabel = sessionLengthMins
    ? (sessionLengthMins < 60 ? `${sessionLengthMins} min` : sessionLengthMins % 60 === 0 ? `${sessionLengthMins / 60}h` : `${Math.floor(sessionLengthMins / 60)}h ${sessionLengthMins % 60}m`)
    : null;

  const sessionSchedule = (() => {
    if (schedule) return schedule;
    if (!firstSession) return null;
    const dayList = (firstSession.recurrence_days ?? []).join(', ');
    if (!dayList) return null;
    const h = firstSession.start_time;
    if (h === null || h === undefined) return dayList;
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const mins = Math.round((h % 1) * 60);
    const ampm = h < 12 ? 'AM' : 'PM';
    const timeStr = mins ? `${Math.floor(hour12)}:${String(mins).padStart(2, '0')} ${ampm}` : `${hour12} ${ampm}`;
    return `${dayList} · ${timeStr}`;
  })();

  const goals: string[] = (() => {
    if (!group.goals) return [];
    try {
      const parsed = JSON.parse(group.goals);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch { /* not JSON */ }
    return group.goals.split(/\n|;\s*/).map((s: string) => s.trim()).filter(Boolean);
  })();

  const whatsIncluded: string[] = [
    'Live group sessions',
    sessionSchedule ? sessionSchedule.split('\n')[0] : null,
    sessionLengthLabel ? `${sessionLengthLabel} per session` : null,
    price === 0 ? 'Free to join' : 'Cancel any time',
    group.whatsapp_link ? 'WhatsApp group access' : null,
    group.google_classroom_link ? 'Google Classroom access' : null,
  ].filter(Boolean) as string[];

  const ctaLabel = group.enrolled ? 'Open class'
    : isPending ? 'Request pending'
    : isFull ? 'Join waitlist'
    : group.require_join_requests ? 'Request to join'
    : 'Join class';

  const handleCta = () => {
    if (group.enrolled) { window.location.href = `/student/classes/${group.id}`; return; }
    if (!isPending) onJoin();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-28 lg:pb-8">
      <Link href="/student/find-tutors" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> Back to explore
      </Link>

      {/* ── Hero banner ──────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-3xl border border-border"
        style={{ background: group.cover_image ? undefined : `linear-gradient(135deg, oklch(0.88 0.09 ${hue}), oklch(0.55 0.16 ${hue}))` }}
      >
        {group.cover_image && (
          <>
            <img src={group.cover_image} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50" />
          </>
        )}
        {/* Large emoji watermark */}
        <div className="absolute inset-y-0 right-0 hidden md:flex items-center justify-end pr-8 opacity-20 select-none pointer-events-none">
          <span className="text-[14rem] leading-none font-black text-white">📚</span>
        </div>

        <div className="relative p-6 sm:p-10 max-w-3xl text-white">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            {group.form_level && (
              <span className="rounded-full bg-white/20 backdrop-blur px-3 py-1">{formatLevel(group.form_level)}</span>
            )}
            {group.subject && (
              <span className="rounded-full bg-white/20 backdrop-blur px-3 py-1">{group.subject}</span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur px-3 py-1">
              <Users className="size-3" /> Live group class
            </span>
            {promo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 text-amber-900 px-3 py-1 font-bold">
                🏷 {promoLabel(promo)}
              </span>
            )}
            {group.enrolled && (
              <span className="rounded-full bg-brand text-white px-3 py-1">Enrolled</span>
            )}
            {group.require_join_requests && !group.enrolled && (
              <span className="rounded-full bg-white/20 backdrop-blur px-3 py-1">Approval required</span>
            )}
          </div>

          <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">{group.name}</h1>
          {group.description && (
            <p className="mt-3 text-sm sm:text-base text-white/85 max-w-2xl line-clamp-3">{group.description}</p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {group.average_rating !== null && group.average_rating > 0 ? (
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Star className="size-4 fill-amber-300 text-amber-300" />
                {group.average_rating.toFixed(1)}
                <span className="text-white/75 font-normal">({ratingSummary.total} ratings)</span>
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4" /> {group.member_count} enrolled
            </span>
            {group.tutor && (
              <Link
                href={`/student/tutors/${group.tutor.id}`}
                className="inline-flex items-center gap-2 hover:underline"
              >
                {group.tutor.avatar_url ? (
                  <img src={group.tutor.avatar_url} alt={tutorName} className="size-7 rounded-full object-cover" />
                ) : (
                  <span className="grid size-7 place-items-center rounded-full bg-white/25 text-[10px] font-bold">
                    {tutorInitials}
                  </span>
                )}
                <span className="font-semibold">Taught by {tutorName}</span>
                {group.tutor.rating_average && <BadgeCheck className="size-4" />}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats bar ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 rounded-2xl border border-border bg-background overflow-hidden">
        <StatTile
          icon={CalendarDays}
          label="Schedule"
          value={sessionSchedule ? sessionSchedule.split('\n')[0].split(' · ')[0] : 'TBD'}
          sub={sessionSchedule ? (sessionSchedule.split('\n')[0].split(' · ')[1] ?? '') : ''}
        />
        <StatTile
          icon={Clock}
          label="Session length"
          value={sessionLengthLabel ?? 'TBD'}
          sub="per session"
        />
        <StatTile
          icon={Sparkles}
          label="Level"
          value={group.form_level ? formatLevel(group.form_level) : 'All levels'}
          sub={group.subject ?? ''}
        />
        <StatTile
          icon={Users}
          label={isLow ? 'Seats left' : 'Cohort'}
          value={isFull ? 'Full' : isLow ? `${spotsLeft} left` : `${group.member_count}/${group.max_students}`}
          sub={`${group.member_count} enrolled`}
        />
      </div>

      {/* ── Main grid ────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
        {/* Left: content */}
        <div className="space-y-8">
          {/* About this class */}
          {group.description && (
            <section>
              <h2 className="text-lg font-bold text-ink">About this class</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink">{group.description}</p>
            </section>
          )}

          {/* What you'll learn */}
          {goals.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-ink">What you'll learn</h2>
              <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {goals.map((g, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ink">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* What's included */}
          <section>
            <h2 className="text-lg font-bold text-ink">What's included</h2>
            <ul className="mt-4 space-y-2">
              {whatsIncluded.map((w) => (
                <li key={w} className="flex items-start gap-2 text-sm text-ink">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* External channels (post-enroll only) */}
          {group.enrolled && (group.whatsapp_link || group.google_classroom_link) && (
            <section className="rounded-2xl border border-border bg-background p-5 space-y-3">
              <h2 className="font-bold text-ink">Class channels</h2>
              <p className="text-xs text-muted-foreground">Join your tutor's external channels to stay updated.</p>
              <div className="flex flex-wrap gap-2">
                {group.whatsapp_link && (
                  <a href={group.whatsapp_link} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#25D366] text-white text-sm font-semibold hover:opacity-90">
                    <MessageSquare className="size-4" /> Join WhatsApp group
                  </a>
                )}
                {group.google_classroom_link && (
                  <a href={group.google_classroom_link} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-ink text-white text-sm font-semibold hover:bg-ink/80">
                    <Globe className="size-4" /> Join Google Classroom
                  </a>
                )}
              </div>
            </section>
          )}

          {/* Pending request banner */}
          {isPending && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <div className="size-8 rounded-lg bg-amber-100 grid place-items-center shrink-0">
                <Clock className="size-4 text-amber-700" />
              </div>
              <div>
                <div className="font-semibold text-amber-900 text-sm">Request pending</div>
                <p className="text-xs text-amber-700 mt-0.5">
                  Your request is waiting for the tutor's approval. You'll get a notification once they respond.
                </p>
              </div>
            </div>
          )}

          {/* Reviews */}
          <section className="space-y-4">
            <RatingBreakdown summary={ratingSummary} activeFilter={ratingFilter} onFilter={setRatingFilter} />
            <CommentSection
              targetKind="class"
              targetId={group.id}
              viewerIsOwnerTutor={false}
              viewerLoggedIn={true}
              activeRatingFilter={ratingFilter}
              onClearFilter={() => setRatingFilter(null)}
            />
          </section>

          {/* Instructor */}
          {group.tutor && (
            <section>
              <h2 className="text-lg font-bold text-ink mb-4">Instructor</h2>
              <Link
                href={`/student/tutors/${group.tutor.id}`}
                className="flex items-start gap-4 rounded-2xl border border-border bg-background p-5 hover:border-brand/50 transition shadow-card"
              >
                {group.tutor.avatar_url ? (
                  <img src={group.tutor.avatar_url} alt={tutorName} className="size-16 rounded-2xl object-cover shrink-0" />
                ) : (
                  <div
                    className="grid size-16 place-items-center rounded-2xl text-xl font-bold shrink-0"
                    style={{ background: `oklch(0.85 0.1 ${hashHue(group.tutor.id)})`, color: `oklch(0.28 0.07 ${hashHue(group.tutor.id)})` }}
                  >
                    {tutorInitials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-bold text-ink">{tutorName}</span>
                    <BadgeCheck className="size-4 text-brand-deep" />
                  </div>
                  {group.tutor.rating_average && (
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-3 fill-amber-400 text-amber-400" /> {group.tutor.rating_average.toFixed(2)}
                      </span>
                      {group.tutor.rating_count ? <span>{group.tutor.rating_count} reviews</span> : null}
                    </div>
                  )}
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                    View full profile, qualifications, reviews and other classes by {tutorName.split(' ').pop()}.
                  </p>
                </div>
                <ChevronRight className="size-5 text-muted-foreground self-center shrink-0" />
              </Link>
            </section>
          )}

          {/* More classes by this tutor */}
          {group.other_classes_by_tutor.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-ink">More classes by {tutorName}</h2>
                <Link href={`/tutors/${group.tutor_id}`} className="text-sm font-semibold text-brand-deep hover:underline flex items-center gap-1">
                  View profile <ChevronRight className="size-3.5" />
                </Link>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {group.other_classes_by_tutor.map((c) => {
                  const cardHue = hashHue(c.id);
                  const cardPrice = c.price_monthly ?? c.price_per_session ?? 0;
                  const spotsLeft = c.max_students !== null ? c.max_students - c.member_count : null;
                  const isPopular = c.member_count >= 8 || c.average_rating >= 4.5;
                  const curriculum = (c.form_level ?? '').toUpperCase().startsWith('CAPE') ? 'CAPE'
                    : (c.form_level ?? '').toUpperCase().startsWith('SEA') ? 'SEA' : 'CSEC';
                  return (
                    <Link
                      key={c.id}
                      href={`/student/explore/${c.id}`}
                      className="group rounded-2xl border border-border bg-background overflow-hidden hover:border-brand/40 hover:shadow-card transition-all flex flex-col"
                    >
                      <div
                        className="relative h-32 flex items-end p-3 overflow-hidden"
                        style={c.cover_image
                          ? { backgroundImage: `url(${c.cover_image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                          : { background: `linear-gradient(135deg, oklch(0.75 0.14 ${cardHue}), oklch(0.5 0.18 ${cardHue}))` }
                        }
                      >
                        <div className="absolute top-3 left-3 flex items-center gap-1.5">
                          <span className="rounded-full bg-white/20 backdrop-blur px-2.5 py-0.5 text-[10px] font-bold text-white">{curriculum}</span>
                          {isPopular && spotsLeft === null && (
                            <span className="rounded-full bg-black/40 backdrop-blur px-2.5 py-0.5 text-[10px] font-bold text-white">Popular</span>
                          )}
                          {spotsLeft !== null && spotsLeft <= 3 && spotsLeft > 0 && (
                            <span className="rounded-full bg-black/40 backdrop-blur px-2.5 py-0.5 text-[10px] font-bold text-white">Only {spotsLeft} left</span>
                          )}
                        </div>
                      </div>
                      <div className="p-4 flex-1 flex flex-col gap-1">
                        <div className="font-bold text-sm text-ink line-clamp-2 leading-snug group-hover:text-brand-deep transition">{c.name}</div>
                        <div className="flex items-center justify-between mt-auto pt-2">
                          <div className="flex items-center gap-1">
                            {c.average_rating > 0 && (
                              <>
                                <Star className="size-3.5 fill-amber-400 text-amber-400" />
                                <span className="text-xs font-bold text-ink">{c.average_rating.toFixed(1)}</span>
                                <span className="text-xs text-muted-foreground">({c.total_reviews})</span>
                              </>
                            )}
                          </div>
                          <span className="text-sm font-bold text-ink">
                            {cardPrice > 0 ? fmtTTD(cardPrice) : 'Free'}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* ── Right: sticky enrollment card ────────────────────── */}
        <aside className="hidden lg:block lg:sticky lg:top-24 self-start">
          <div className="rounded-2xl border border-border bg-background p-6 space-y-5 shadow-card">
            {/* Promo badge */}
            {promo && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1 text-[11px] font-bold uppercase tracking-wider">
                <Sparkles className="size-3" /> {promoLabel(promo)}
              </div>
            )}

            {/* Price */}
            <div>
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-bold text-ink">
                  {price === 0 ? 'Free' : discountedPrice !== null ? fmtTTD(discountedPrice) : fmtTTD(price)}
                </div>
                {discountedPrice !== null && (
                  <div className="text-base text-muted-foreground line-through">{fmtTTD(price)}</div>
                )}
              </div>
              {price > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {group.price_monthly ? 'per month' : 'per session'} · {isFull ? 'Class full' : `${spotsLeft} seats left`}
                </div>
              )}
            </div>

            {/* CTA */}
            {group.enrolled ? (
              <Link
                href={`/student/classes/${group.id}`}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-deep transition"
              >
                <Check className="size-4" /> Go to my class
              </Link>
            ) : isPending ? (
              <span className="flex w-full items-center justify-center gap-2 rounded-full bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-800">
                <Clock className="size-4" /> Request pending
              </span>
            ) : (
              <button
                onClick={handleCta}
                className="w-full rounded-full bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-deep transition"
              >
                {isFull ? 'Join waitlist' : group.require_join_requests ? 'Request to join' : `Enrol${price > 0 ? ` · ${fmtTTD(effectivePrice)}${group.price_monthly ? '/mo' : ''}` : ''}`}
              </button>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/student/messages"
                className="rounded-xl border border-border py-2.5 grid place-items-center gap-1.5 hover:bg-muted text-xs font-semibold text-ink"
              >
                <MessageSquare className="size-4" /> Message
              </Link>
              <button
                onClick={() => navigator.clipboard?.writeText(window.location.href).catch(() => {})}
                className="rounded-xl border border-border py-2.5 grid place-items-center gap-1.5 hover:bg-muted text-xs font-semibold text-ink"
              >
                <Share2 className="size-4" /> Share
              </button>
            </div>

            {/* What's included */}
            <ul className="space-y-2 pt-2 border-t border-border">
              {whatsIncluded.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-ink">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-deep" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* ── Mobile sticky CTA ────────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-border px-4 py-3 flex items-center gap-4 shadow-xl">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            {price > 0 ? (
              <>
                {discountedPrice !== null ? (
                  <>
                    <span className="text-xl font-bold text-brand-deep">{fmtTTD(discountedPrice)}</span>
                    <span className="text-sm line-through text-muted-foreground">{fmtTTD(price)}</span>
                  </>
                ) : (
                  <span className="text-xl font-bold text-ink">{fmtTTD(price)}</span>
                )}
                <span className="text-xs text-muted-foreground">/{group.price_monthly ? 'mo' : 'session'}</span>
              </>
            ) : (
              <span className="text-xl font-bold text-brand-deep">Free</span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {group.enrolled ? 'You are enrolled' : isPending ? 'Awaiting approval' : group.require_join_requests ? 'Approval required' : 'Join instantly'}
          </div>
        </div>
        <button
          onClick={handleCta}
          disabled={isPending}
          className={cn(
            'px-5 py-3 rounded-2xl text-sm font-semibold inline-flex items-center gap-2 shrink-0 transition disabled:opacity-60',
            group.enrolled ? 'bg-brand text-white' : isFull ? 'bg-ink text-white' : 'bg-brand text-white hover:bg-brand-deep',
          )}
        >
          {isFull && !group.enrolled && !isPending && <Lock className="size-4" />}
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

// ── Join flow ─────────────────────────────────────────────────────────────────

function JoinFlow({ group, onBack, onSuccess, profile, hasLinkedParent }: {
  group: GroupData;
  onBack: () => void;
  onSuccess: (step: Step) => void;
  profile: any;
  hasLinkedParent: boolean;
}) {
  const isFull = group.max_students - group.member_count <= 0;
  const isRequest = group.require_join_requests;
  const price = group.price_monthly ?? group.price_per_session ?? group.price_per_course ?? 0;
  const promo = group.active_promotion;
  const discountedPrice = promo ? Math.round(price * (1 - promo.discount / 100)) : null;
  const effectivePrice = discountedPrice ?? price;
  const hasFeedbackAddon = false;
  const [wantsFeedback, setWantsFeedback] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const totalPrice = effectivePrice + (wantsFeedback && hasFeedbackAddon ? (group.parent_feedback_price ?? 0) : 0);
  const feedbackDecisionRequired = hasFeedbackAddon && hasLinkedParent && wantsFeedback === null;
  const [err, setErr] = useState('');

  const heading = isFull ? 'Join the waitlist' : isRequest ? 'Request to join' : 'Confirm your enrolment';
  const confirmLabel = isFull ? 'Add me to the waitlist' : isRequest ? 'Send request to tutor' : 'Confirm & join class';

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
        if (!res.ok) throw new Error(data.error || 'Failed to process enrolment. Please try again.');
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
    <div className="max-w-md mx-auto py-6 space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
          <ArrowLeft className="size-4" /> Back
        </button>
        <h1 className="font-bold text-ink">{heading}</h1>
        <Link href="/student/find-tutors" className="size-8 grid place-items-center rounded-full hover:bg-muted text-muted-foreground">
          <X className="size-4" />
        </Link>
      </div>

      <ClassSummaryCard group={group} />

      <section className="rounded-2xl border border-border bg-background p-5 space-y-3">
        <h2 className="font-bold text-ink text-sm">Billing</h2>
        <div className="flex items-start gap-2">
          <CreditCard className="size-4 text-brand-deep mt-0.5 shrink-0" />
          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">Model</div>
            <div className="text-sm text-ink font-medium">
              {price > 0 ? (group.price_monthly ? 'Monthly subscription' : 'Per-session billing') : 'Free — no payment required'}
            </div>
          </div>
        </div>
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

      {err && <p className="text-xs text-rose-600 text-center">{err}</p>}

      <button
        onClick={handleConfirm}
        disabled={submitting || feedbackDecisionRequired}
        className="block w-full text-center px-5 py-3 rounded-2xl bg-brand text-white font-semibold hover:bg-brand-deep disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting
          ? <span className="inline-flex items-center gap-2 justify-center"><Loader2 className="size-4 animate-spin" /> Processing…</span>
          : confirmLabel}
      </button>
    </div>
  );
}

// ── Success screens ───────────────────────────────────────────────────────────

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
    <div className="max-w-md mx-auto py-12 space-y-6 text-center">
      <div className={cn('mx-auto size-14 rounded-2xl grid place-items-center', copy.tone)}>{copy.icon}</div>
      <div>
        <h1 className="text-2xl font-bold text-ink">{copy.title}</h1>
        <p className="text-sm text-muted-foreground mt-2">{copy.body}</p>
      </div>
      <div className="rounded-2xl border border-border bg-background p-4">
        <ClassSummaryCard group={group} />
      </div>
      <Link href={copy.href} className="inline-block px-5 py-3 rounded-2xl bg-ink text-white font-semibold hover:bg-ink/90">
        {copy.next}
      </Link>
    </div>
  );
}

// ── Class summary card ────────────────────────────────────────────────────────

function ClassSummaryCard({ group }: { group: GroupData }) {
  const hue = hashHue(group.id);
  const price = group.price_monthly ?? group.price_per_session ?? group.price_per_course ?? 0;
  const promo = group.active_promotion;
  const discountedPrice = promo ? Math.round(price * (1 - promo.discount / 100)) : null;
  const tutorName = group.tutor?.display_name || group.tutor?.full_name || 'Tutor';
  const schedule = (() => {
    const entries = parseScheduleData(group.schedule_data);
    if (entries.length) return scheduleToDisplay(entries);
    return group.schedule_display || null;
  })();

  return (
    <div className="flex items-start gap-3">
      <div
        className="size-12 rounded-2xl grid place-items-center text-2xl shrink-0 mt-0.5"
        style={{ background: `linear-gradient(135deg, oklch(0.88 0.09 ${hue}), oklch(0.6 0.15 ${hue}))` }}
      >
        📚
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ink">{group.name}</div>
        <div className="text-xs text-muted-foreground">by {tutorName}</div>
        {schedule && <div className="text-xs text-muted-foreground mt-1 whitespace-pre-line leading-relaxed">{schedule}</div>}
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
