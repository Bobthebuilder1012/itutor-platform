'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import SuggestTimeModal from '@/components/booking/SuggestTimeModal';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Star, Heart, Share2, MessageSquare,
  BadgeCheck, ChevronLeft, ChevronRight, X, Check,
  Sparkles, TrendingUp, Info,
} from 'lucide-react';
import { getTutorPublicCalendar } from '@/lib/services/bookingService';
import { fmtTTD } from '@/lib/utils/formatCurrency';

// ── Types ────────────────────────────────────────────────────────────────────

type Review = {
  id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  student: { full_name: string; username: string };
};

type TutorGroup = {
  id: string;
  name: string;
  subject: string | null;
  cover_image: string | null;
  price_monthly: number | null;
  price_per_session: number | null;
};

type TutorProfile = {
  id: string;
  full_name: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  intro_video_url: string | null;
  country: string;
  bio: string | null;
  tutor_verification_status: string | null;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0x7fffffff;
  return h % 360;
}

function TutorSquareAvatar({ name, hue, size = 88 }: { name: string; hue: number; size?: number }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return (
    <div
      style={{
        width: size, height: size,
        background: `oklch(0.85 0.1 ${hue})`,
        color: `oklch(0.28 0.07 ${hue})`,
        fontSize: size * 0.36,
        fontWeight: 700,
        borderRadius: size * 0.22,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function ReviewAvatar({ name, hue }: { name: string; hue: number }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="grid place-items-center font-bold shrink-0 rounded-xl"
      style={{ width: 40, height: 40, background: `oklch(0.85 0.1 ${hue})`, color: `oklch(0.28 0.07 ${hue})`, fontSize: 14 }}
    >
      {initial}
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <div className="inline-flex">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={cn('size-3.5', i < n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
      ))}
    </div>
  );
}

// ── Intro video player ────────────────────────────────────────────────────────

function resolveVideoEmbed(url: string): { kind: 'iframe'; src: string } | { kind: 'video'; src: string } | null {
  try {
    const u = new URL(url);
    // YouTube
    const ytMatch = u.hostname.replace('www.', '') === 'youtube.com' && u.searchParams.get('v');
    const ytShort = u.hostname === 'youtu.be' && u.pathname.slice(1);
    const ytId = ytMatch || ytShort;
    if (ytId) return { kind: 'iframe', src: `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1` };
    // Vimeo
    const vimeoMatch = u.hostname.replace('www.', '') === 'vimeo.com' && u.pathname.match(/^\/(\d+)/);
    if (vimeoMatch) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
    // Direct video file
    if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) return { kind: 'video', src: url };
  } catch { /* bad URL */ }
  return null;
}

function IntroVideoPlayer({ url }: { url: string }) {
  const embed = resolveVideoEmbed(url);
  if (!embed) return null;
  if (embed.kind === 'iframe') {
    return <iframe src={embed.src} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="absolute inset-0 w-full h-full" />;
  }
  return <video src={embed.src} controls className="absolute inset-0 w-full h-full object-contain" />;
}

// ── Availability helpers ──────────────────────────────────────────────────────

type Window = { start: number; end: number };
type DayAvail = { date: Date; windows: Window[]; booked: Window[] };

const SLOT_STEP = 0.5;
const DURATION_OPTIONS_MIN = [60, 90, 120];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

function startsForDuration(eff: Window[], durationHours: number): number[] {
  const out: number[] = [];
  for (const w of eff) {
    let t = Math.ceil(w.start / SLOT_STEP) * SLOT_STEP;
    while (t + durationHours <= w.end + 1e-9) {
      out.push(Number(t.toFixed(2)));
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
      const start = isoToHour(w.start_at); const end = isoToHour(w.end_at);
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

function toHHMM(h: number): string {
  const hr = Math.floor(h);
  const m = Math.round((h - hr) * 60);
  return `${String(hr).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fromHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h + m / 60;
}

function fmtTime12(h: number): string {
  const hr = Math.floor(h);
  const m = Math.round((h - hr) * 60);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const h12 = ((hr + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function slotToISO(date: Date, startHour: number, durationHours: number) {
  const startH = Math.floor(startHour); const startM = Math.round((startHour - startH) * 60);
  const start = new Date(date); start.setHours(startH, startM, 0, 0);
  const endHour = startHour + durationHours;
  const endH = Math.floor(endHour); const endM = Math.round((endHour - endH) * 60);
  const end = new Date(date); end.setHours(endH, endM, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
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
  const [saved, setSaved] = useState(false);
  const [showConfirmSheet, setShowConfirmSheet] = useState(false);
  const [tutorGroups, setTutorGroups] = useState<TutorGroup[]>([]);

  // Scheduler state
  const [duration, setDuration] = useState(60); // minutes
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState<{ dayIdx: number; time: string } | null>(null);
  const [slots, setSlots] = useState<DayAvail[]>(() => emptySlots(30));
  const [calendarLoading, setCalendarLoading] = useState(true);
  const scheduleRef = useRef<HTMLDivElement>(null);

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
        .select('id, full_name, username, display_name, avatar_url, intro_video_url, country, bio, tutor_verification_status')
        .eq('id', tutorId).eq('role', 'tutor').single();
      if (tutorError) throw tutorError;
      if (!tutorData) { alert('Tutor not found'); router.push('/student/find-tutors'); return; }

      const { data: tutorSubjects } = await supabase
        .from('tutor_subjects').select('subject_id, price_per_hour_ttd').eq('tutor_id', tutorId);
      const { data: allSubjects } = await supabase
        .from('subjects').select('id, name, label, curriculum, level');
      const subjectsMap = new Map((allSubjects ?? []).map((s) => [s.id, s]));
      const subjects = (tutorSubjects ?? [])
        .map((ts) => {
          const s = subjectsMap.get(ts.subject_id);
          return s ? { id: s.id, name: s.label || s.name, curriculum: s.curriculum || s.level || '', level: s.level || '', price_per_hour_ttd: ts.price_per_hour_ttd } : null;
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      const summaryRes = await fetch(`/api/public/tutors/${tutorId}/reviews?limit=6&offset=0`, { cache: 'no-store' });
      const summary = await summaryRes.json().catch(() => ({}));
      const avgRating = Number.isFinite(Number(summary?.averageRating)) ? Number(summary.averageRating) : null;
      const totalReviews = typeof summary?.ratingCount === 'number' ? summary.ratingCount : 0;
      setReviews(summary?.reviews || []);

      const { count } = await supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('tutor_id', tutorId).eq('status', 'COMPLETED_ASSUMED');
      if (count !== null) setCompletedSessions(count);

      const fetchedTutor = { ...tutorData, subjects, average_rating: avgRating, total_reviews: totalReviews };
      setTutor(fetchedTutor);
      if (subjects.length === 1) setSelectedSubject(subjects[0]);

      supabase
        .from('groups')
        .select('id, name, subject, cover_image, price_monthly, price_per_session')
        .eq('tutor_id', tutorId)
        .is('archived_at', null)
        .limit(6)
        .then(({ data }) => { if (data) setTutorGroups(data); });

      loadCalendar(tutorId).then(setSlots).catch(console.error).finally(() => setCalendarLoading(false));
    } catch (err) {
      console.error(err);
      setCalendarLoading(false);
    } finally {
      setLoading(false);
    }
  }

  const confirmBooking = async () => {
    if (!selectedSubject || !profile || !selected) return;
    setConfirmLoading(true); setConfirmError('');
    try {
      const startHour = fromHHMM(selected.time);
      const durationHours = duration / 60;
      const { start, end } = slotToISO(days[selected.dayIdx], startHour, durationHours);
      const res = await fetch('/api/bookings/direct-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorId, subjectId: selectedSubject.id, requestedStartAt: start, requestedEndAt: end, studentNotes: bookingNotes.trim() || undefined, durationMinutes: duration }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.details ? `${result.error}: ${result.details}` : result?.error || 'Failed to book session');
      setShowConfirmSheet(false); setBookingNotes('');
      if (result.paymentUrl) { window.location.href = result.paymentUrl; return; }
      alert('Session booked! You\'ll receive a confirmation shortly.');
      router.push('/student/bookings');
    } catch (err: any) {
      setConfirmError(err.message || 'Failed to book session');
    } finally {
      setConfirmLoading(false);
    }
  };

  // ── Scheduler computed values ───────────────────────────────────────────────

  // Must be before early returns to satisfy Rules of Hooks
  const monday = useMemo(() => {
    const t = new Date();
    const m = new Date(t);
    m.setDate(t.getDate() - ((t.getDay() + 6) % 7) + weekOffset * 7);
    m.setHours(0, 0, 0, 0);
    return m;
  }, [weekOffset]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d;
  }), [monday]);

  const slotsByDay = useMemo(() => {
    const durationHours = duration / 60;
    return days.map((day) => {
      const found = slots.find((s) => {
        const sd = new Date(s.date);
        return sd.getFullYear() === day.getFullYear() && sd.getMonth() === day.getMonth() && sd.getDate() === day.getDate();
      });
      if (!found) return [];
      const eff = effectiveWindows(found.windows, found.booked);
      return startsForDuration(eff, durationHours).map(toHHMM);
    });
  }, [days, slots, duration]);

  const month = days[0].toLocaleString('en-US', { month: 'short' });
  const endMonth = days[6].toLocaleString('en-US', { month: 'short' });
  const rangeLabel = `${month} ${days[0].getDate()} – ${endMonth !== month ? endMonth + ' ' : ''}${days[6].getDate()}`;

  // ── Loading / not found ─────────────────────────────────────────────────────

  if (profileLoading || loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green" />
      </div>
    );
  }

  if (!tutor) {
    return <div className="text-center py-12"><p className="text-muted-foreground">Tutor not found</p></div>;
  }

  const hue = hashHue(tutor.id);
  const name = getDisplayName(tutor);
  const minPrice = tutor.subjects.length ? Math.min(...tutor.subjects.map((s) => s.price_per_hour_ttd)) : 0;
  const priceLabel = minPrice > 0 ? `TT$${minPrice}` : 'Free';
  const selectedDayObj = selected ? days[selected.dayIdx] : null;

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-5 pb-28 lg:pb-8">
        <Link href="/student/find-tutors" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-ink">
          <ArrowLeft className="size-4" /> Back to tutors
        </Link>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
          {/* ── LEFT COLUMN ──────────────────────────────────────────── */}
          <div className="space-y-8">

            {/* Intro video — only shown when the tutor has uploaded one */}
            {tutor.intro_video_url && (
              <div className="relative aspect-video rounded-3xl overflow-hidden border border-border bg-black">
                <IntroVideoPlayer url={tutor.intro_video_url} />
              </div>
            )}

            {/* Identity */}
            <div className="flex items-start gap-4">
              {tutor.avatar_url ? (
                <img
                  src={tutor.avatar_url}
                  alt={name}
                  style={{ width: 88, height: 88, borderRadius: 88 * 0.22, flexShrink: 0, objectFit: 'cover' }}
                />
              ) : (
                <TutorSquareAvatar name={name} hue={hue} size={88} />
              )}
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-4xl font-bold text-ink leading-tight">{name}</h1>
                  {tutor.tutor_verification_status === 'VERIFIED' && (
                    <BadgeCheck className="size-5 text-brand-deep" />
                  )}
                </div>
                <div className="mt-1.5 text-sm text-muted-foreground">
                  {tutor.subjects.map((s) => s.name).join(' · ')}
                  {tutor.country ? ` · ${tutor.country}` : ''}
                </div>
                <div className="flex items-center gap-3 mt-2 text-sm flex-wrap">
                  {tutor.average_rating !== null ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-ink">
                      <Star className="size-4 fill-amber-400 text-amber-400" />
                      {tutor.average_rating.toFixed(1)}
                      <span className="font-normal text-muted-foreground">({tutor.total_reviews} reviews)</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No reviews yet</span>
                  )}
                  <span className="text-muted-foreground">· {completedSessions} lessons</span>
                </div>
              </div>
            </div>

            {/* Subjects / highlights */}
            {tutor.subjects.length > 0 && (
              <div>
                <div className="inline-flex items-center gap-2 text-sm font-bold text-ink mb-3">
                  <Sparkles className="size-4 text-brand-deep" /> Subjects
                </div>
                <div className="flex flex-wrap gap-2">
                  {tutor.subjects.map((s) => (
                    <span key={s.id} className="rounded-xl px-3 py-1.5 text-sm font-semibold bg-muted text-ink">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* About */}
            {tutor.bio && (
              <section>
                <h2 className="text-2xl font-bold text-ink">More about me</h2>
                <p className="mt-3 text-sm text-ink leading-relaxed">{tutor.bio}</p>
              </section>
            )}

            {/* Reviews */}
            <section>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-ink">What my students say</h2>
                <Info className="size-4 text-muted-foreground" />
              </div>
              {tutor.average_rating !== null ? (
                <div className="flex items-center gap-4 mt-4">
                  <span className="text-6xl font-bold text-ink leading-none">{tutor.average_rating.toFixed(1)}</span>
                  <div className="size-14 rounded-full bg-amber-400 grid place-items-center shadow-md">
                    <Star className="size-8 fill-amber-600 text-amber-600" />
                  </div>
                </div>
              ) : null}
              {tutor.total_reviews > 0 && (
                <div className="text-sm text-muted-foreground mt-2">Based on {tutor.total_reviews} student reviews</div>
              )}
              {reviews.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No reviews yet.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6 mt-6">
                  {reviews.map((r) => (
                    <div key={r.id}>
                      <div className="flex items-center gap-3">
                        <ReviewAvatar name={r.student.full_name} hue={hashHue(r.id)} />
                        <div>
                          <div className="font-bold text-ink text-sm">{r.student.full_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3"><Stars n={r.stars} /></div>
                      {r.comment && <p className="text-sm text-ink mt-2 leading-relaxed">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Group classes by this tutor */}
            {tutorGroups.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold text-ink mb-4">Classes by {name}</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {tutorGroups.map((g) => {
                    const classPrice = g.price_monthly ?? g.price_per_session ?? 0;
                    return (
                      <Link
                        key={g.id}
                        href={`/student/explore/${g.id}`}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-background p-4 hover:border-brand/50 transition shadow-card"
                      >
                        <div
                          className="size-12 rounded-xl shrink-0 overflow-hidden flex items-center justify-center"
                          style={{ background: g.cover_image ? undefined : `oklch(0.85 0.1 ${hashHue(g.id)})` }}
                        >
                          {g.cover_image ? (
                            <img src={g.cover_image} alt={g.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-lg font-bold" style={{ color: `oklch(0.28 0.07 ${hashHue(g.id)})` }}>
                              {g.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm text-ink truncate">{g.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {g.subject ?? 'Group class'}{classPrice > 0 ? ` · ${fmtTTD(classPrice)}${g.price_monthly ? '/mo' : '/session'}` : ' · Free'}
                          </div>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── 7-day booking scheduler ──────────────────────────── */}
            <section ref={scheduleRef} id="book" className="scroll-mt-20 space-y-4">
              <header>
                <h2 className="text-2xl font-bold text-ink">Book a lesson</h2>
                <p className="text-sm text-muted-foreground mt-1">Pick a time for your first lesson. Times shown in your local timezone.</p>
              </header>

              {/* Duration toggle */}
              <div className="grid grid-cols-3 rounded-2xl bg-muted p-1 max-w-sm">
                {DURATION_OPTIONS_MIN.map((d) => (
                  <button
                    key={d}
                    onClick={() => { setDuration(d); setSelected(null); }}
                    className={cn(
                      'py-3 rounded-xl text-sm font-bold transition',
                      duration === d ? 'bg-background text-ink shadow-sm' : 'text-muted-foreground',
                    )}
                  >
                    {d} min
                  </button>
                ))}
              </div>

              {/* Subject selector (if multiple) */}
              {tutor.subjects.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {tutor.subjects.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSubject(s)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-semibold border transition',
                        selectedSubject?.id === s.id ? 'bg-ink text-white border-ink' : 'border-border text-muted-foreground hover:border-ink/30',
                      )}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Week navigator */}
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2">
                  <button
                    onClick={() => setWeekOffset((o) => o - 1)}
                    className="size-9 rounded-xl border border-border grid place-items-center hover:bg-muted"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    onClick={() => setWeekOffset((o) => o + 1)}
                    className="size-9 rounded-xl border border-border grid place-items-center hover:bg-muted"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                  <span className="ml-1 text-sm font-semibold text-ink">{rangeLabel}</span>
                </div>
                <div className="hidden sm:block text-[11px] text-muted-foreground rounded-lg border border-border px-2.5 py-1.5">
                  GMT -4:00
                </div>
              </div>

              {/* 7-day grid */}
              {calendarLoading ? (
                <div className="rounded-3xl border border-border overflow-hidden p-12 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
                </div>
              ) : (
                <div className="rounded-3xl border border-border overflow-hidden">
                  <div className="grid grid-cols-7 border-b border-border bg-muted/40">
                    {days.map((d, i) => {
                      const hasSlots = slotsByDay[i].length > 0;
                      return (
                        <div key={i} className={cn('py-3 text-center', hasSlots && 'border-b-2 border-brand')}>
                          <div className="text-[10px] sm:text-xs font-bold uppercase text-muted-foreground">{DAY_LABELS[(d.getDay() + 6) % 7]}</div>
                          <div className="text-base sm:text-lg font-bold text-ink mt-0.5">{d.getDate()}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-7 divide-x divide-border min-h-[360px]">
                    {slotsByDay.map((daySlots, dayIdx) => (
                      <div key={dayIdx} className="p-1.5 space-y-1">
                        {daySlots.length === 0 ? (
                          <div className="text-center text-xs text-muted-foreground/60 py-6">—</div>
                        ) : (
                          daySlots.map((time) => {
                            const isSelected = selected?.dayIdx === dayIdx && selected?.time === time;
                            return (
                              <button
                                key={time}
                                onClick={() => setSelected({ dayIdx, time })}
                                className={cn(
                                  'w-full py-1.5 text-[11px] sm:text-sm font-semibold rounded-md transition',
                                  isSelected ? 'bg-brand text-white' : 'text-ink hover:bg-brand-soft',
                                )}
                              >
                                {time}
                              </button>
                            );
                          })
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mobile inline continue button */}
              <button
                onClick={() => { if (selected) { if (!selectedSubject && tutor.subjects.length > 0) setSelectedSubject(tutor.subjects[0]); setShowConfirmSheet(true); } else { scheduleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }}
                disabled={!selected}
                className={cn(
                  'lg:hidden w-full py-3.5 rounded-2xl font-bold text-base transition',
                  selected ? 'bg-brand text-white hover:bg-brand-deep' : 'bg-muted text-muted-foreground cursor-not-allowed',
                )}
              >
                {selected
                  ? `Continue · ${days[selected.dayIdx].toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${selected.time}`
                  : 'Pick a time to continue'}
              </button>
            </section>
          </div>

          {/* ── RIGHT — sticky booking card ──────────────────────────── */}
          <aside className="hidden lg:block lg:sticky lg:top-20 self-start">
            <div className="rounded-3xl border border-border bg-background p-5 shadow-card space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-ink">{priceLabel}</span>
                <span className="text-sm text-muted-foreground">/ {duration}-min lesson</span>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-2 border-b border-border">
                <div>
                  {tutor.average_rating !== null ? (
                    <>
                      <div className="inline-flex items-center gap-1">
                        <Star className="size-4 fill-amber-400 text-amber-400" />
                        <span className="text-xl font-bold text-ink">{tutor.average_rating.toFixed(1)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{tutor.total_reviews} reviews</div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">No reviews</div>
                  )}
                </div>
                <div>
                  <div className="text-xl font-bold text-ink">{completedSessions.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">lessons</div>
                </div>
              </div>

              {/* Selection preview */}
              <div className="rounded-2xl bg-muted/60 p-3 text-sm">
                <div className="text-xs text-muted-foreground">Your selection</div>
                {selected && selectedDayObj ? (
                  <div className="font-semibold text-ink mt-1">
                    {selectedDayObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · {selected.time} · {duration} min
                  </div>
                ) : (
                  <div className="text-muted-foreground mt-1">Pick a time from the schedule</div>
                )}
              </div>

              {selected ? (
                <button
                  onClick={() => { if (!selectedSubject && tutor.subjects.length > 0) setSelectedSubject(tutor.subjects[0]); setShowConfirmSheet(true); }}
                  className="w-full py-3.5 rounded-2xl bg-brand text-white font-bold hover:bg-brand-deep transition"
                >
                  Continue to confirm
                </button>
              ) : (
                <button
                  onClick={() => scheduleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="w-full py-3.5 rounded-2xl bg-brand text-white font-bold hover:bg-brand-deep transition"
                >
                  Book trial lesson
                </button>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Link href="/student/messages" className="rounded-xl border border-border py-3 grid place-items-center hover:bg-muted" title="Message">
                  <MessageSquare className="size-4" />
                </Link>
                <button onClick={() => setSaved((s) => !s)} className="rounded-xl border border-border py-3 grid place-items-center hover:bg-muted" title={saved ? 'Saved' : 'Save tutor'}>
                  <Heart className={cn('size-4', saved && 'fill-rose-500 text-rose-500')} />
                </button>
                <button
                  onClick={() => { const url = window.location.href; navigator.clipboard?.writeText(url).catch(() => {}); }}
                  className="rounded-xl border border-border py-3 grid place-items-center hover:bg-muted"
                  title="Share"
                >
                  <Share2 className="size-4" />
                </button>
              </div>

              {completedSessions > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <TrendingUp className="size-4 text-ink mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold text-ink">Popular tutor</div>
                    <div className="text-muted-foreground text-xs">{completedSessions} completed lessons.</div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* ── Mobile floating bar ─────────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 bg-background/95 backdrop-blur border-t border-border px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-ink">{priceLabel}</div>
          <div className="text-[11px] text-muted-foreground">{duration}-min lesson</div>
        </div>
        <button
          onClick={() => {
            if (selected) {
              if (!selectedSubject && tutor.subjects.length > 0) setSelectedSubject(tutor.subjects[0]);
              setShowConfirmSheet(true);
            } else {
              scheduleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}
          className="rounded-full bg-brand text-white px-6 py-2.5 text-sm font-bold"
        >
          {selected ? 'Continue' : 'Book trial lesson'}
        </button>
      </div>

      {/* ── Confirm booking sheet ───────────────────────────────────── */}
      {showConfirmSheet && selected && selectedDayObj && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setShowConfirmSheet(false)}>
          <div className="bg-background w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-background border-b border-border px-5 py-3 flex items-center justify-between">
              <div className="font-semibold text-ink">Confirm booking</div>
              <button onClick={() => setShowConfirmSheet(false)} className="size-8 rounded-full hover:bg-muted grid place-items-center">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Subject picker if multiple */}
              {tutor.subjects.length > 1 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Subject</div>
                  <div className="space-y-2">
                    {tutor.subjects.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSubject(s)}
                        className={cn('w-full text-left px-4 py-3 rounded-2xl border flex items-center justify-between transition', selectedSubject?.id === s.id ? 'border-brand bg-brand-soft' : 'border-border hover:border-brand/50')}
                      >
                        <div>
                          <div className="font-semibold text-ink text-sm">{s.name}</div>
                          <div className="text-xs text-muted-foreground">{s.curriculum} · {s.price_per_hour_ttd > 0 ? `TT$${s.price_per_hour_ttd}/hr` : 'Free'}</div>
                        </div>
                        {tutor.tutor_verification_status === 'VERIFIED' && <BadgeCheck className="size-5 text-brand-deep" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="rounded-2xl border border-border p-4 space-y-2 text-sm">
                {[
                  { label: 'Tutor', value: name },
                  ...(selectedSubject ? [{ label: 'Subject', value: selectedSubject.name }] : []),
                  { label: 'Date', value: selectedDayObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) },
                  { label: 'Time', value: `${selected.time} — ${fmtTime12(fromHHMM(selected.time) + duration / 60)}` },
                  { label: 'Duration', value: `${duration} min` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-ink font-medium">{value}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-2 flex justify-between font-semibold text-ink">
                  <span>Total</span>
                  <span>{selectedSubject && selectedSubject.price_per_hour_ttd > 0 ? `TT$${((selectedSubject.price_per_hour_ttd * duration) / 60).toFixed(0)}` : 'Free'}</span>
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
                disabled={confirmLoading || (tutor.subjects.length > 1 && !selectedSubject)}
                onClick={confirmBooking}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-brand text-white font-semibold hover:bg-brand-deep disabled:opacity-60 transition"
              >
                {confirmLoading ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Check className="size-4" />}
                {confirmLoading ? 'Booking…' : 'Book session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedSubject && (
        <SuggestTimeModal
          isOpen={suggestTimeModalOpen}
          onClose={() => setSuggestTimeModalOpen(false)}
          onSuccess={() => router.push('/student/bookings')}
          tutorId={tutorId}
          tutorName={name}
          studentId={profile!.id}
          subjectId={selectedSubject.id}
          subjectName={selectedSubject.name}
          pricePerHour={selectedSubject.price_per_hour_ttd}
        />
      )}
    </>
  );
}
