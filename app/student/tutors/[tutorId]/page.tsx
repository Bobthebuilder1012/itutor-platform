'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import SuggestTimeModal from '@/components/booking/SuggestTimeModal';
import UserAvatar from '@/components/UserAvatar';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Star, Heart, MessageSquare, Award, Clock, Video,
  BadgeCheck, ChevronLeft, ChevronRight, X, Check, MapPin,
  ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { getTutorPublicCalendar } from '@/lib/services/bookingService';

// ── Types ────────────────────────────────────────────────────────────────────

type Review = {
  id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  student: { full_name: string; username: string };
};

type TutorProfile = {
  id: string;
  full_name: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  school?: string | null;
  institution_id?: string | null;
  country: string;
  bio: string | null;
  tutor_verification_status: string | null;
  created_at?: string;
  subjects: Array<{
    id: string;
    name: string;
    curriculum: string;
    level: string;
    price_per_hour_ttd: number;
  }>;
  average_rating: number | null;
  total_reviews: number;
};

// ── Availability helpers ──────────────────────────────────────────────────────

type Window = { start: number; end: number };
type DayAvail = { date: Date; windows: Window[]; booked: Window[] };

const SLOT_STEP = 0.5;
const MIN_BOOKING_LEAD_MINUTES = 15;
const DURATION_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

function fmtTime(h: number) {
  const hr = Math.floor(h);
  const m = Math.round((h - hr) * 60);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const h12 = ((hr + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function effectiveWindows(windows: Window[], booked: Window[]): Window[] {
  let out = windows.map((w) => ({ ...w }));
  for (const b of booked) {
    const next: Window[] = [];
    for (const w of out) {
      if (b.end <= w.start || b.start >= w.end) { next.push(w); continue; }
      if (b.start > w.start) next.push({ start: w.start, end: b.start });
      if (b.end < w.end) next.push({ start: b.end, end: w.end });
    }
    out = next;
  }
  return out.filter((w) => w.end - w.start >= SLOT_STEP);
}

function minBookableStartHour(date: Date): number | null {
  const cutoff = new Date(Date.now() + MIN_BOOKING_LEAD_MINUTES * 60 * 1000);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const cutoffDay = new Date(cutoff);
  cutoffDay.setHours(0, 0, 0, 0);

  if (day < cutoffDay) return Number.POSITIVE_INFINITY;
  if (day > cutoffDay) return null;

  const cutoffHour = cutoff.getHours() + cutoff.getMinutes() / 60;
  return Math.ceil(cutoffHour / SLOT_STEP) * SLOT_STEP;
}

function startsForDuration(eff: Window[], duration: number, date: Date): number[] {
  const out: number[] = [];
  const minStart = minBookableStartHour(date);
  for (const w of eff) {
    let t = Math.ceil(w.start / SLOT_STEP) * SLOT_STEP;
    while (t + duration <= w.end + 1e-9) {
      if (minStart == null || t >= minStart - 1e-9) {
        out.push(Number(t.toFixed(2)));
      }
      t += SLOT_STEP;
    }
  }
  return out;
}

function emptySlots(days = 30): DayAvail[] {
  const out: DayAvail[] = [];
  const start = new Date(); start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    out.push({ date: d, windows: [], booked: [] });
  }
  return out;
}

function isoToHour(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

async function loadCalendar(tutorId: string, days = 30): Promise<DayAvail[]> {
  const rangeStart = new Date(); rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart); rangeEnd.setDate(rangeStart.getDate() + days);

  const cal = await getTutorPublicCalendar(tutorId, rangeStart.toISOString(), rangeEnd.toISOString());

  return Array.from({ length: days }, (_, i) => {
    const d = new Date(rangeStart); d.setDate(rangeStart.getDate() + i);
    const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);

    const windows: Window[] = [];
    for (const w of cal.availability_windows ?? []) {
      const ws = new Date(w.start_at); const we = new Date(w.end_at);
      if (we <= dayStart || ws >= dayEnd) continue;
      const start = isoToHour(w.start_at);
      const end = isoToHour(w.end_at);
      if (end > start) windows.push({ start, end });
    }

    const booked: Window[] = [];
    for (const b of cal.busy_blocks ?? []) {
      const bs = new Date(b.start_at); const be = new Date(b.end_at);
      if (be <= dayStart || bs >= dayEnd) continue;
      booked.push({ start: isoToHour(b.start_at), end: isoToHour(b.end_at) });
    }

    return { date: d, windows, booked };
  });
}

function slotToISO(date: Date, startHour: number, duration: number) {
  const startH = Math.floor(startHour);
  const startM = Math.round((startHour - startH) * 60);
  const start = new Date(date); start.setHours(startH, startM, 0, 0);
  const endHour = startHour + duration;
  const endH = Math.floor(endHour);
  const endM = Math.round((endHour - endH) * 60);
  const end = new Date(date); end.setHours(endH, endM, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ── BookingCard ───────────────────────────────────────────────────────────────

function BookingCard({
  priceLabel, subjects, pickedSubject, setPickedSubject,
  slots, pickedDay, setPickedDay, pickedTime, setPickedTime,
  duration, setDuration, scrollRef, scrollDays, embedded, onContinue,
}: {
  priceLabel: string;
  subjects: TutorProfile['subjects'];
  pickedSubject: TutorProfile['subjects'][0] | null;
  setPickedSubject: (s: TutorProfile['subjects'][0]) => void;
  slots: DayAvail[];
  pickedDay: number;
  setPickedDay: (n: number) => void;
  pickedTime: number | null;
  setPickedTime: (n: number | null) => void;
  duration: number;
  setDuration: (n: number) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  scrollDays: (dir: 1 | -1) => void;
  embedded?: boolean;
  onContinue?: () => void;
}) {
  const day = slots[pickedDay];
  const eff = effectiveWindows(day.windows, day.booked);
  const longestWindow = eff.reduce((m, w) => Math.max(m, w.end - w.start), 0);
  const starts = startsForDuration(eff, duration, day.date);

  useEffect(() => {
    if (pickedTime != null && !starts.includes(pickedTime)) setPickedTime(null);
  }, [pickedTime, starts, setPickedTime]);

  function continueWithCurrentSelection() {
    if (pickedTime == null || pickedSubject == null) return;
    const minStart = minBookableStartHour(day.date);
    if (minStart != null && pickedTime < minStart - 1e-9) {
      setPickedTime(null);
      return;
    }
    onContinue?.();
  }

  return (
    <div className={cn(!embedded && 'rounded-3xl bg-background border border-border p-5')}>
      {!embedded && (
        <div className="flex items-baseline justify-between mb-4">
          <div><span className="text-2xl font-bold text-ink">{priceLabel}</span><span className="text-sm text-muted-foreground">/hr</span></div>
          <span className="text-xs px-2 py-1 rounded-full bg-brand-soft text-forest font-semibold">Available</span>
        </div>
      )}

      {subjects.length > 1 && (
        <>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Subject</div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {subjects.map((s) => (
              <button key={s.id} onClick={() => { setPickedSubject(s); setPickedTime(null); }} className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition', pickedSubject?.id === s.id ? 'bg-ink text-white border-ink' : 'border-border text-muted-foreground hover:border-ink/30')}>
                {s.name}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pick a day</div>
        <div className="flex gap-1">
          <button onClick={() => scrollDays(-1)} className="size-6 grid place-items-center rounded-full hover:bg-muted"><ChevronLeft className="size-3.5" /></button>
          <button onClick={() => scrollDays(1)} className="size-6 grid place-items-center rounded-full hover:bg-muted"><ChevronRight className="size-3.5" /></button>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-1.5 overflow-x-auto pb-2 mb-4 -mx-1 px-1 snap-x">
        {slots.map((s, i) => {
          const dayEff = effectiveWindows(s.windows, s.booked);
          const disabled = dayEff.length === 0;
          return (
            <button key={i} onClick={() => { setPickedDay(i); setPickedTime(null); }} disabled={disabled} className={cn('shrink-0 w-14 py-2 rounded-xl text-center transition snap-start disabled:opacity-30 border', pickedDay === i ? 'bg-ink text-white border-ink' : 'border-border hover:border-brand')}>
              <div className="text-[10px] font-semibold opacity-70 uppercase">{i === 0 ? 'Today' : s.date.toLocaleDateString('en', { weekday: 'short' })}</div>
              <div className="text-base font-bold mt-0.5">{s.date.getDate()}</div>
              <div className="text-[9px] opacity-60 mt-0.5">{s.date.toLocaleDateString('en', { month: 'short' })}</div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Duration</div>
        <div className="text-[11px] text-muted-foreground">{pickedSubject ? `TT$${(pickedSubject.price_per_hour_ttd * duration).toFixed(0)} total` : ''}</div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
        {DURATION_OPTIONS.map((d) => {
          const fits = longestWindow >= d - 1e-9;
          return (
            <button key={d} onClick={() => setDuration(d)} disabled={!fits} className={cn('shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition disabled:opacity-30', duration === d ? 'bg-ink text-white border-ink' : 'border-border text-muted-foreground hover:border-ink/30')}>
              {d % 1 === 0 ? `${d} hr` : `${d} hrs`}
            </button>
          );
        })}
      </div>

      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Start times · {day.date.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })}
      </div>
      {eff.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center mb-4">Tutor isn&apos;t available on this day</div>
      ) : starts.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center mb-4">No {duration} hr slot fits. Try a shorter duration or another day.</div>
      ) : (
        <div className="space-y-3 mb-4">
          {eff.map((w, wi) => {
            const winStarts = starts.filter((t) => t >= w.start - 1e-9 && t + duration <= w.end + 1e-9);
            if (winStarts.length === 0) return null;
            return (
              <div key={wi}>
                <div className="text-[10px] text-muted-foreground mb-1.5">Free {fmtTime(w.start)} – {fmtTime(w.end)}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {winStarts.map((t) => (
                    <button key={t} onClick={() => setPickedTime(t)} className={cn('py-2 rounded-xl text-xs font-medium border transition', pickedTime === t ? 'bg-brand text-white border-brand' : 'border-border hover:border-brand')}>
                      {fmtTime(t)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        disabled={pickedTime == null || pickedSubject == null}
        onClick={continueWithCurrentSelection}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-brand text-white font-semibold hover:bg-brand-deep transition disabled:opacity-50"
      >
        <Video className="size-4" />
        {pickedTime != null && pickedSubject != null
          ? (embedded
            ? `Continue · ${fmtTime(pickedTime)} – ${fmtTime(pickedTime + duration)}`
            : `Book ${duration} hr${duration === 1 ? '' : 's'} · ${fmtTime(pickedTime)}`)
          : 'Select a subject & time'}
      </button>
      {!embedded && <p className="text-xs text-muted-foreground text-center mt-3">Free cancellation up to 24h before</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TutorProfilePage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const tutorId = params.tutorId as string;

  const [tutor, setTutor] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<TutorProfile['subjects'][0] | null>(null);
  const [suggestTimeModalOpen, setSuggestTimeModalOpen] = useState(false);
  const [bookingNotes, setBookingNotes] = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [paidClassesEnabled, setPaidClassesEnabled] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [voted, setVoted] = useState<Record<string, 'up' | 'down' | undefined>>({});
  const [saved, setSaved] = useState(false);
  const [showBookingSheet, setShowBookingSheet] = useState(false);
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3>(1);
  const [pickedTime, setPickedTime] = useState<number | null>(null);
  const [pickedDay, setPickedDay] = useState(0);
  const [duration, setDuration] = useState(1);
  const [slots, setSlots] = useState<DayAvail[]>(() => emptySlots(30));
  const [calendarLoading, setCalendarLoading] = useState(true);
  const dayScrollRef = useRef<HTMLDivElement>(null);
  const scrollDays = (dir: 1 | -1) => dayScrollRef.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || profile.role !== 'student') { router.push('/login'); return; }
    fetchPaidClassesFlag();
    fetchTutorProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, profileLoading, router, tutorId]);

  async function fetchPaidClassesFlag() {
    try {
      const res = await fetch('/api/feature-flags', { cache: 'no-store' });
      const data = await res.json();
      setPaidClassesEnabled(Boolean(data?.paidClassesEnabled));
    } catch { setPaidClassesEnabled(false); }
  }

  async function fetchTutorProfile() {
    try {
      const { data: tutorData, error: tutorError } = await supabase
        .from('profiles')
        .select('id, full_name, username, display_name, avatar_url, school, institution_id, country, bio, tutor_verification_status, created_at')
        .eq('id', tutorId).eq('role', 'tutor').single();
      if (tutorError) throw tutorError;
      if (!tutorData) { alert('Tutor not found'); router.push('/student/find-tutors'); return; }

      const { data: tutorSubjects, error: subjectsError } = await supabase
        .from('tutor_subjects').select('subject_id, price_per_hour_ttd').eq('tutor_id', tutorId);
      if (subjectsError) throw subjectsError;

      const { data: allSubjects, error: allSubjectsError } = await supabase
        .from('subjects').select('id, name, label, curriculum, level');
      if (allSubjectsError) throw allSubjectsError;

      const subjectsMap = new Map(allSubjects.map((s) => [s.id, s]));
      const subjects = tutorSubjects
        .map((ts) => {
          const subject = subjectsMap.get(ts.subject_id);
          return subject ? {
            id: subject.id,
            name: subject.label || subject.name,
            curriculum: subject.curriculum || subject.level || '',
            level: subject.level || '',
            price_per_hour_ttd: ts.price_per_hour_ttd ?? 0,
          } : null;
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      const summaryRes = await fetch(`/api/public/tutors/${tutorId}/reviews?limit=5&offset=0`, { cache: 'no-store' });
      const summary = await summaryRes.json().catch(() => ({}));
      const avgNum = summary?.averageRating == null ? null : Number(summary.averageRating);
      const avgRating = Number.isFinite(avgNum) ? avgNum : null;
      const totalReviews = typeof summary?.ratingCount === 'number' ? summary.ratingCount : 0;
      setReviews(summary?.reviews || []);

      const { count } = await supabase
        .from('sessions').select('*', { count: 'exact', head: true })
        .eq('tutor_id', tutorId).eq('status', 'COMPLETED_ASSUMED');
      if (count !== null) setCompletedSessions(count);

      const fetchedTutor = { ...tutorData, subjects, average_rating: avgRating, total_reviews: totalReviews };
      setTutor(fetchedTutor);
      if (subjects.length === 1) setSelectedSubject(subjects[0]);

      // Load real tutor availability
      loadCalendar(tutorId)
        .then(setSlots)
        .catch((err) => console.error('Failed to load calendar:', err))
        .finally(() => setCalendarLoading(false));
    } catch (error) {
      console.error('Error fetching tutor profile:', error);
      alert('Failed to load tutor profile');
      setCalendarLoading(false);
    } finally {
      setLoading(false);
    }
  }

  const confirmBooking = async (startAt: string, endAt: string) => {
    if (!selectedSubject || !profile) return;
    setConfirmLoading(true);
    setConfirmError('');
    try {
      const durationMinutes = Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000);
      const res = await fetch('/api/bookings/direct-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutorId,
          subjectId: selectedSubject.id,
          requestedStartAt: startAt,
          requestedEndAt: endAt,
          studentNotes: bookingNotes.trim() || undefined,
          durationMinutes,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        const msg = result?.details
          ? `${result.error || 'Failed to book session'}: ${result.details}`
          : result?.error || 'Failed to book session';
        throw new Error(msg);
      }
      setShowBookingSheet(false);
      setBookingNotes('');
      // Paid path: server returns a LuniPay hosted-checkout URL and no
      // booking has been created yet. Send the user straight to LuniPay
      // — the booking is materialised by the webhook on payment success.
      if (result.paymentUrl) { window.location.href = result.paymentUrl; return; }
      alert('Session booked! You\'ll receive a confirmation shortly.');
      router.push('/student/bookings');
    } catch (err: any) {
      setConfirmError(err.message || 'Failed to book session');
    } finally {
      setConfirmLoading(false);
    }
  };

  const vote = (id: string, dir: 'up' | 'down') => {
    setVoted((v) => ({ ...v, [id]: v[id] === dir ? undefined : dir }));
  };

  const openBookingSheet = () => { setBookingStep(1); setPickedTime(null); setShowBookingSheet(true); };
  const minPrice = tutor?.subjects.length ? Math.min(...tutor.subjects.map((s) => s.price_per_hour_ttd)) : 0;
  const priceLabel = !paidClassesEnabled ? 'Free' : (minPrice > 0 ? `TT$${minPrice}` : 'Rate not set');

  if (profileLoading || loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green" />
      </div>
    );
  }

  if (!tutor) {
    return <div className="text-center py-12"><p className="text-gray-600">Tutor not found</p></div>;
  }

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-6">
        <Link href="/student/find-tutors" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-ink">
          <ArrowLeft className="size-4" /> Back to Explore
        </Link>

        {/* Header */}
        <div className="rounded-3xl bg-background border border-border overflow-hidden">
          <div className="h-32 sm:h-40 bg-gradient-to-br from-brand to-brand-deep" />
          <div className="px-5 sm:px-6 pb-6">
            <div className="flex items-end justify-between -mt-12 sm:-mt-14">
              <UserAvatar avatarUrl={tutor.avatar_url} name={getDisplayName(tutor)} size={96} className="ring-4 ring-background rounded-full" />
              <div className="flex gap-2 mb-1">
                <button onClick={() => setSaved((s) => !s)} className="size-10 rounded-full border border-border bg-background grid place-items-center hover:bg-muted">
                  <Heart className={cn('size-4', saved && 'fill-coral text-coral')} />
                </button>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-ink">{getDisplayName(tutor)}</h1>
                {tutor.tutor_verification_status === 'VERIFIED' && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep bg-brand-soft px-2 py-0.5 rounded-full">
                    <BadgeCheck className="size-3.5" /> Verified
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{tutor.subjects.map((s) => s.name).join(' · ')}</p>
              <div className="flex items-center gap-3 mt-2 text-sm flex-wrap">
                {tutor.average_rating !== null ? (
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-4 fill-coral text-coral" />
                    <span className="font-semibold">{tutor.average_rating.toFixed(1)}</span>
                    <span className="text-muted-foreground">({tutor.total_reviews} reviews)</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm">No reviews yet</span>
                )}
                <span className="text-muted-foreground">•</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="size-3.5" />{tutor.country}</span>
                <span className="text-muted-foreground">•</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground"><Check className="size-3.5" />{completedSessions} sessions</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-5">
              {[
                { icon: Award, label: 'Sessions', value: `${completedSessions}` },
                { icon: Clock, label: 'Hourly rate', value: priceLabel },
                { icon: Star, label: 'Reviews', value: tutor.total_reviews > 0 ? `${tutor.total_reviews}` : 'None yet' },
              ].map((m) => (
                <div key={m.label} className="rounded-2xl bg-mint p-3">
                  <m.icon className="size-4 text-brand-deep mb-1" />
                  <div className="text-[11px] text-muted-foreground">{m.label}</div>
                  <div className="text-sm font-semibold text-ink">{m.value}</div>
                </div>
              ))}
            </div>

            <button onClick={openBookingSheet} className="mt-4 w-full sm:hidden inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-brand text-white font-semibold">
              <Video className="size-4" /> Book a 1:1{paidClassesEnabled && minPrice > 0 ? ` — TT$${minPrice}/hr` : ''}
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {tutor.bio && (
              <section className="rounded-3xl bg-background border border-border p-6">
                <h2 className="font-semibold text-ink mb-2">About</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{tutor.bio}</p>
              </section>
            )}

            <section className="rounded-3xl bg-background border border-border p-6">
              <h2 className="font-semibold text-ink mb-3">Subjects</h2>
              {tutor.subjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subjects listed</p>
              ) : (
                <ul className="divide-y divide-border">
                  {tutor.subjects.map((s) => (
                    <li key={s.id} className="py-3 flex items-center gap-3">
                      {tutor.tutor_verification_status === 'VERIFIED' && <BadgeCheck className="size-4 text-brand-deep shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-ink">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.curriculum}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-bold text-ink">
                          {!paidClassesEnabled ? 'Free' : s.price_per_hour_ttd > 0 ? `TT$${s.price_per_hour_ttd}` : 'Rate not set'}
                        </span>
                        {paidClassesEnabled && s.price_per_hour_ttd > 0 && <span className="text-xs text-muted-foreground">/hr</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Reviews */}
            <section className="rounded-3xl bg-background border border-border p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-ink">Reviews · {tutor.total_reviews}</h2>
                {tutor.average_rating !== null && (
                  <span className="text-sm font-semibold inline-flex items-center gap-1">
                    <Star className="size-4 fill-coral text-coral" /> {tutor.average_rating.toFixed(1)}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-4">Only students who&apos;ve completed a class can leave a review.</p>
              {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No reviews yet.</p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((r) => (
                    <div key={r.id} className="border-t border-border pt-4 first:border-0 first:pt-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <div className="size-7 rounded-full bg-brand-soft text-forest grid place-items-center text-xs font-bold shrink-0">
                          {r.student.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-ink">{r.student.full_name}</span>
                        <div className="flex">
                          {Array.from({ length: r.stars }).map((_, i) => <Star key={i} className="size-3 fill-coral text-coral" />)}
                        </div>
                      </div>
                      {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                      <div className="flex items-center gap-2 mt-2.5">
                        <button onClick={() => vote(r.id, 'up')} className={cn('inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition', voted[r.id] === 'up' ? 'border-brand bg-brand-soft text-brand-deep' : 'border-border text-muted-foreground hover:border-brand/50')}>
                          <ThumbsUp className="size-3" /> Helpful
                        </button>
                        <button onClick={() => vote(r.id, 'down')} className={cn('inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition', voted[r.id] === 'down' ? 'border-coral bg-coral-soft text-coral' : 'border-border text-muted-foreground hover:border-coral/50')}>
                          <ThumbsDown className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Desktop booking sidebar */}
          <aside className="hidden lg:block lg:sticky lg:top-20 self-start">
            {calendarLoading ? (
              <div className="rounded-2xl border border-border bg-card p-8 flex items-center justify-center min-h-[200px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
              </div>
            ) : (
            <BookingCard
              priceLabel={priceLabel}
              subjects={tutor.subjects}
              pickedSubject={selectedSubject}
              setPickedSubject={setSelectedSubject}
              slots={slots}
              pickedDay={pickedDay}
              setPickedDay={setPickedDay}
              pickedTime={pickedTime}
              setPickedTime={setPickedTime}
              duration={duration}
              setDuration={setDuration}
              scrollRef={dayScrollRef}
              scrollDays={scrollDays}
              onContinue={() => { setBookingStep(3); setShowBookingSheet(true); }}
            />
            )}
          </aside>
        </div>
      </div>

      {/* Mobile booking sheet */}
      {showBookingSheet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setShowBookingSheet(false)}>
          <div className="bg-background w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-background border-b border-border px-5 py-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Step {bookingStep} of 3</div>
                <div className="font-semibold text-ink text-sm">
                  {bookingStep === 1 ? 'Pick a subject' : bookingStep === 2 ? 'Pick a date & time' : 'Confirm booking'}
                </div>
              </div>
              <button onClick={() => setShowBookingSheet(false)} className="size-8 rounded-full hover:bg-muted grid place-items-center"><X className="size-4" /></button>
            </div>
            <div className="p-5">
              {bookingStep === 1 && (
                <div className="space-y-2">
                  {tutor.subjects.map((s) => (
                    <button key={s.id} onClick={() => { setSelectedSubject(s); setPickedTime(null); setBookingStep(2); }} className={cn('w-full text-left px-4 py-3 rounded-2xl border flex items-center justify-between transition', selectedSubject?.id === s.id ? 'border-brand bg-brand-soft' : 'border-border hover:border-brand/50')}>
                      <div>
                        <div className="font-semibold text-ink text-sm">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.curriculum} · {paidClassesEnabled ? `TT$${s.price_per_hour_ttd}/hr` : 'Free'}</div>
                      </div>
                      {tutor.tutor_verification_status === 'VERIFIED' && <BadgeCheck className="size-5 text-brand-deep" />}
                    </button>
                  ))}
                </div>
              )}
              {bookingStep === 2 && (
                calendarLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
                  </div>
                ) : (
                <BookingCard
                  priceLabel={priceLabel}
                  subjects={tutor.subjects}
                  pickedSubject={selectedSubject}
                  setPickedSubject={setSelectedSubject}
                  slots={slots}
                  pickedDay={pickedDay}
                  setPickedDay={setPickedDay}
                  pickedTime={pickedTime}
                  setPickedTime={setPickedTime}
                  duration={duration}
                  setDuration={setDuration}
                  scrollRef={dayScrollRef}
                  scrollDays={scrollDays}
                  embedded
                  onContinue={() => setBookingStep(3)}
                />
                )
              )}
              {bookingStep === 3 && selectedSubject && pickedTime != null && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border p-4 space-y-2 text-sm">
                    {[
                      { label: 'Tutor', value: getDisplayName(tutor) },
                      { label: 'Subject', value: selectedSubject.name },
                      { label: 'Date', value: slots[pickedDay].date.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' }) },
                      { label: 'Time', value: `${fmtTime(pickedTime)} – ${fmtTime(pickedTime + duration)}` },
                      { label: 'Duration', value: `${duration} hr${duration === 1 ? '' : 's'}` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="text-ink font-medium">{value}</span>
                      </div>
                    ))}
                    <div className="border-t border-border pt-2 flex justify-between font-semibold text-ink">
                      <span>Total</span>
                      <span>{paidClassesEnabled ? `TT$${(selectedSubject.price_per_hour_ttd * duration).toFixed(0)}` : 'Free'}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Notes for tutor <span className="font-normal">(optional)</span></label>
                    <textarea
                      value={bookingNotes}
                      onChange={(e) => setBookingNotes(e.target.value)}
                      placeholder="Any specific topics or questions you'd like to cover?"
                      rows={3}
                      className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-ink placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                    />
                  </div>
                  {confirmError && <p className="text-xs text-red-500">{confirmError}</p>}
                  <p className="text-xs text-muted-foreground">Free cancellation up to 24h before the session.</p>
                  <button
                    disabled={confirmLoading}
                    onClick={() => {
                      const minStart = minBookableStartHour(slots[pickedDay].date);
                      if (minStart != null && pickedTime < minStart - 1e-9) {
                        setPickedTime(null);
                        setBookingStep(2);
                        setConfirmError('Please select a later time.');
                        return;
                      }
                      const { start, end } = slotToISO(slots[pickedDay].date, pickedTime, duration);
                      confirmBooking(start, end);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-brand text-white font-semibold hover:bg-brand-deep disabled:opacity-60"
                  >
                    {confirmLoading ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Check className="size-4" />}
                    {confirmLoading ? 'Booking…' : 'Book session'}
                  </button>
                </div>
              )}
            </div>
            {bookingStep > 1 && bookingStep < 3 && (
              <div className="sticky bottom-0 bg-background border-t border-border p-4">
                <button onClick={() => setBookingStep((s) => (s - 1) as 1 | 2 | 3)} className="text-sm text-muted-foreground">← Back</button>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedSubject && (
        <SuggestTimeModal
          isOpen={suggestTimeModalOpen}
          onClose={() => setSuggestTimeModalOpen(false)}
          onSuccess={() => router.push('/student/bookings')}
          tutorId={tutorId}
          tutorName={getDisplayName(tutor)}
          studentId={profile!.id}
          subjectId={selectedSubject.id}
          subjectName={selectedSubject.name}
          pricePerHour={selectedSubject.price_per_hour_ttd}
        />
      )}
    </>
  );
}
