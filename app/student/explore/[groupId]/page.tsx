'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Star, Calendar, Clock, Users, Check, Lock, AlertCircle,
  ShieldCheck, CreditCard, X, Loader2, Sparkles, BadgeCheck,
  MessageSquare, Globe, Flame,
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
};

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
  }, [groupId]);

  async function fetchGroup() {
    try {
      const res = await fetch(`/api/groups/${groupId}`, { cache: 'no-store' });
      if (!res.ok) { setLoading(false); return; }
      const payload = await res.json();
      const g = payload?.group ?? payload?.data?.group ?? payload;
      if (!g) { setLoading(false); return; }

      const tutorObj = Array.isArray(g.tutor) ? g.tutor[0] : g.tutor;

      // Check enrollment + pending status
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

  if (step === 'join') return <JoinFlow group={group} onBack={() => setStep('detail')} onSuccess={(s) => setStep(s)} profile={profile} hasLinkedParent={hasLinkedParent} />;
  if (step === 'joined') return <JoinedScreen group={group} kind="enrolled" />;
  if (step === 'awaiting-approval') return <JoinedScreen group={group} kind="awaiting-approval" />;
  return <Detail group={group} onJoin={() => setStep('join')} />;
}

/* ─── Detail screen ──────────────────────────────────── */

function Detail({ group, onJoin }: { group: GroupData; onJoin: () => void }) {
  const isPending = group.memberStatus === 'pending';
  const spotsLeft = group.max_students - group.member_count;
  const isFull = spotsLeft <= 0;
  const isLow = spotsLeft > 0 && spotsLeft <= 3;
  const price = group.price_monthly ?? group.price_per_session ?? 0;
  const promo = group.active_promotion;
  const discountedPrice = promo ? Math.round(price * (1 - promo.discount / 100)) : null;
  const gradient = gradientForGroup(group.name);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [ratingSummary, setRatingSummary] = useState<RatingSummary>({ average: 0, total: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });

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
  const tutorInitials = tutorName.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').split(' ').map((p: string) => p[0]).join('').slice(0, 2);
  const schedule = (() => {
    const entries = parseScheduleData(group.schedule_data);
    if (entries.length) return scheduleToDisplay(entries);
    return group.schedule_display || null;
  })();

  const ctaLabel = group.enrolled ? 'Open class'
    : isPending ? 'Request pending'
    : isFull ? 'Join waitlist'
    : group.require_join_requests ? 'Request to join'
    : 'Join class';

  const handleCta = () => {
    if (group.enrolled) {
      window.location.href = `/student/classes/${group.id}`;
    } else if (!isPending) {
      onJoin();
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-32">
      <Link href="/student/find-tutors" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> All classes
      </Link>

      {/* Hero banner */}
      <section
        className={cn('relative rounded-3xl p-6 sm:p-8 text-white overflow-hidden', !group.cover_image && `bg-gradient-to-br ${gradient}`)}
        style={group.cover_image ? { backgroundImage: `url(${group.cover_image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {group.cover_image && <div className="absolute inset-0 bg-black/40 rounded-3xl" />}
        <div className="relative flex items-start gap-4">
          <div className="size-16 rounded-2xl bg-white/90 backdrop-blur grid place-items-center text-4xl shadow-md shrink-0">📚</div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider font-bold opacity-90">{group.subject}</div>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1 leading-tight">{group.name}</h1>
            {group.description && <p className="text-sm opacity-90 mt-2 line-clamp-2">{group.description}</p>}
          </div>
        </div>

        <div className="relative mt-4 flex flex-wrap gap-2">
          {promo && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-400 text-amber-900 shadow-sm">
              🏷 {promoLabel(promo)}
            </span>
          )}
          {/* Form level badge */}
          {group.form_level && (
            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-white/95 text-ink">{formatLevel(group.form_level)}</span>
          )}
          {group.feedback_mode === 'included_free' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-brand text-white shadow-sm">
              <Sparkles className="size-3.5" /> Free parent feedback
            </span>
          )}
          {group.feedback_mode === 'paid_addon' && group.parent_feedback_price && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 shadow-sm">
              <Sparkles className="size-3.5" /> Parent feedback +{fmtTTD(group.parent_feedback_price)}/mo
            </span>
          )}
          {group.require_join_requests && (
            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-white/95 text-ink">Approval required</span>
          )}
          {group.enrolled && (
            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-500 text-white">Enrolled</span>
          )}
        </div>
      </section>

      {/* Tutor */}
      {group.tutor && (
        <Link href={`/student/tutors/${group.tutor.id}`}
          className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-background hover:bg-muted/40 transition">
          <div className="size-12 rounded-full bg-gradient-to-br from-brand to-emerald-400 grid place-items-center text-white font-bold text-sm shrink-0">
            {tutorInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-ink truncate">{tutorName}</span>
              <BadgeCheck className="size-4 text-brand-deep shrink-0" />
            </div>
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Star className="size-3 fill-amber-500 text-amber-500" />
              <span className="font-semibold text-ink">{group.tutor.rating_average?.toFixed(1) ?? '—'}</span>
              {group.tutor.rating_count ? <span>({group.tutor.rating_count} reviews)</span> : null}
            </div>
          </div>
          <span className="text-xs text-brand-deep font-semibold shrink-0">View profile →</span>
        </Link>
      )}

      {/* Schedule & seats */}
      <section className="rounded-2xl border border-border bg-background p-5 space-y-4">
        <h2 className="font-bold text-ink">Schedule & seats</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {schedule && (
            <InfoRow icon={<Calendar className="size-4 text-brand-deep" />} label="When">
              <span className="whitespace-pre-line">{schedule}</span>
            </InfoRow>
          )}
          <InfoRow icon={<Users className="size-4 text-brand-deep" />} label="Seats">
            <span>
              {group.member_count}/{group.max_students} enrolled
              {isLow && <span className="ml-2 inline-flex items-center gap-1 text-amber-600 font-semibold"><Flame className="size-3.5" /> Only {spotsLeft} left</span>}
              {isFull && <span className="ml-2 text-muted-foreground">· Class full</span>}
            </span>
          </InfoRow>
        </div>
        {/* Enrollment bar */}
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', spotsLeft <= 3 ? 'bg-coral' : 'bg-brand')}
            style={{ width: `${Math.min(100, Math.round((group.member_count / group.max_students) * 100))}%` }} />
        </div>
      </section>

      {/* About */}
      {group.description && (
        <section className="rounded-2xl border border-border bg-background p-5 space-y-2">
          <h2 className="font-bold text-ink">About this class</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{group.description}</p>
        </section>
      )}

      {/* External channels — info only until enrolled */}
      {(group.whatsapp_link || group.google_classroom_link) && (
        <section className="rounded-2xl border border-border bg-background p-5 space-y-3">
          <h2 className="font-bold text-ink">Class channels</h2>
          {group.enrolled ? (
            <>
              <p className="text-xs text-muted-foreground">Join your tutor's external channels to stay updated with announcements and materials.</p>
              <div className="flex flex-wrap gap-2">
                {group.whatsapp_link && (
                  <a href={group.whatsapp_link} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#25D366] text-white text-sm font-semibold hover:opacity-90">
                    <MessageSquare className="size-4" /> Join WhatsApp group
                  </a>
                )}
                {group.google_classroom_link && (
                  <a href={group.google_classroom_link} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-ink text-white text-sm font-semibold hover:bg-forest">
                    <Globe className="size-4" /> Join Google Classroom
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

      {/* Parent feedback — hidden until parent accounts launch */}
      {false && group.feedback_mode && group.feedback_mode !== 'off' && (
        <section className={`rounded-2xl border p-5 space-y-2 ${group.feedback_mode === 'included_free' ? 'border-brand/30 bg-brand-soft/30' : 'border-amber-200 bg-amber-50/40'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`size-10 rounded-xl grid place-items-center shrink-0 ${group.feedback_mode === 'included_free' ? 'bg-brand-soft' : 'bg-amber-100'}`}>
                <Sparkles className={`size-5 ${group.feedback_mode === 'included_free' ? 'text-brand-deep' : 'text-amber-700'}`} />
              </div>
              <div>
                <div className="font-bold text-ink text-sm">
                  {group.feedback_mode === 'included_free' ? 'Free parent feedback included' : 'Parent feedback available'}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {group.feedback_mode === 'included_free'
                    ? 'This tutor sends monthly written feedback reports to your parent at no extra charge.'
                    : 'Monthly written feedback reports sent to your parent — you can add this when joining.'}
                </p>
              </div>
            </div>
            {group.feedback_mode === 'paid_addon' && group.parent_feedback_price && (
              <div className="text-right shrink-0">
                <div className="font-bold text-amber-800">+{fmtTTD(group.parent_feedback_price)}</div>
                <div className="text-[11px] text-muted-foreground">/mo add-on</div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Ratings & Reviews */}
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

      {/* Pending request banner */}
      {isPending && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <div className="size-8 rounded-lg bg-amber-100 grid place-items-center shrink-0">
            <Clock className="size-4 text-amber-700" />
          </div>
          <div>
            <div className="font-semibold text-amber-900 text-sm">Request pending</div>
            <p className="text-xs text-amber-700 mt-0.5">
              Your request to join this class is waiting for the tutor's approval. You'll get a notification once they respond. Requests expire after 48 hours if unanswered.
            </p>
          </div>
        </div>
      )}

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border p-4 flex items-center gap-4 shadow-xl sm:relative sm:bottom-auto sm:rounded-2xl sm:border sm:shadow-none">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            {price > 0 ? (
              <>
                {discountedPrice !== null ? (
                  <>
                    <span className="text-xl font-bold text-brand-deep">{fmtTTD(discountedPrice)}</span>
                    <span className="text-sm line-through text-muted-foreground">{fmtTTD(price)}</span>
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-brand/10 text-brand-deep">{promo!.discount}% off</span>
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
            {group.enrolled ? 'You are enrolled' : isPending ? 'Awaiting tutor approval' : group.require_join_requests ? 'Tutor approval required' : 'Join instantly'}
          </div>
        </div>
        <button
          onClick={handleCta}
          disabled={isPending}
          className={cn(
            'px-5 py-3 rounded-2xl text-sm font-semibold inline-flex items-center gap-2 shrink-0 transition disabled:opacity-60 disabled:cursor-not-allowed',
            group.enrolled ? 'bg-brand text-white hover:bg-brand-deep'
              : isPending ? 'bg-amber-500 text-white'
              : isFull ? 'bg-ink text-white hover:bg-ink/90'
              : 'bg-brand text-white hover:bg-brand-deep'
          )}
        >
          {isFull && !group.enrolled && !isPending && <Lock className="size-4" />}
          {ctaLabel}
        </button>
      </div>
    </div>
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
  const [wantsFeedback, setWantsFeedback] = useState<boolean | null>(null); // null = not yet chosen
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
          <ArrowLeft className="size-4" /> Back
        </button>
        <h1 className="font-bold text-ink">{heading}</h1>
        <Link href="/student/find-tutors" className="size-8 grid place-items-center rounded-full hover:bg-muted text-muted-foreground">
          <X className="size-4" />
        </Link>
      </div>

      {/* Class summary */}
      <ClassSummaryCard group={group} />

      {/* Billing */}
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

      {/* Parent feedback decision — required for paid add-on */}
      {hasFeedbackAddon && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-xl bg-amber-100 grid place-items-center shrink-0">
              <Sparkles className="size-5 text-amber-700" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-ink text-sm">
                Parent feedback add-on <span className="text-amber-700">+{fmtTTD(group.parent_feedback_price ?? 0)}/mo</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Monthly written progress reports from your tutor sent directly to your parent.</p>
            </div>
          </div>

          {hasLinkedParent ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink">Would you like to add parent feedback? <span className="text-rose-500">*</span></p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setWantsFeedback(true)}
                  className={`px-4 py-3 rounded-xl border text-sm font-semibold transition ${wantsFeedback === true ? 'bg-brand text-white border-brand' : 'bg-background border-border text-muted-foreground hover:border-brand/50'}`}
                >
                  Yes, add it
                </button>
                <button
                  type="button"
                  onClick={() => setWantsFeedback(false)}
                  className={`px-4 py-3 rounded-xl border text-sm font-semibold transition ${wantsFeedback === false ? 'bg-muted text-ink border-border' : 'bg-background border-border text-muted-foreground hover:border-border'}`}
                >
                  No thanks
                </button>
              </div>
              {wantsFeedback === true && (
                <p className="text-xs text-brand-deep">+{fmtTTD(group.parent_feedback_price ?? 0)}/mo will be added. Total: {fmtTTD(totalPrice)}/mo</p>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-background border border-amber-200 px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-amber-900">No linked parent account</p>
              <p className="text-xs text-amber-800">To add parent feedback, ask your parent to create an iTutor account and link it to yours from their parent dashboard. You can add it later once linked.</p>
            </div>
          )}
        </section>
      )}

      {/* Terms */}
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

function ClassSummaryCard({ group }: { group: GroupData }) {
  const gradient = gradientForGroup(group.name);
  const price = group.price_monthly ?? group.price_per_session ?? 0;
  const promo = group.active_promotion;
  const discountedPrice = promo ? Math.round(price * (1 - promo.discount / 100)) : null;
  const tutorName = group.tutor?.display_name || group.tutor?.full_name || 'Tutor';
  const schedule = (() => {
    const entries = parseScheduleData(group.schedule_data);
    if (entries.length) return scheduleToDisplay(entries); // ALL days
    return group.schedule_display || null;
  })();

  return (
    <div className="flex items-start gap-3">
      <div className={cn('size-12 rounded-2xl grid place-items-center text-2xl shrink-0 bg-gradient-to-br mt-0.5', gradient)}>📚</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ink">{group.name}</div>
        <div className="text-xs text-muted-foreground">by {tutorName}</div>
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
