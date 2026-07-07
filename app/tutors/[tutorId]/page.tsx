'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import TutorCalendarWidget from '@/components/booking/TutorCalendarWidget';
import VerifiedSubjectsButton from '@/components/tutor/VerifiedSubjectsButton';
import VerifiedSubjectsModal from '@/components/tutor/VerifiedSubjectsModal';
import AuthPromptModal from '@/components/AuthPromptModal';
import { useAuthPrompt } from '@/hooks/useAuthPrompt';
import Link from 'next/link';
import {
  ArrowLeft, Star, Heart, Share2, MessageSquare, Play, Sparkles,
  TrendingUp, ShieldCheck, GraduationCap, Smile, Target, MessageCircle, Pencil,
  BadgeCheck,
} from 'lucide-react';

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
  ratings: Array<{
    id: string;
    stars: number;
    comment: string | null;
    created_at: string;
    student_name: string;
    helpful_count: number;
  }>;
};

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0x7fffffff;
  return h % 360;
}

function TutorSquareAvatar({ name, hue, size = 88 }: { name: string; hue: number; size?: number }) {
  const initials = name
    .replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '')
    .split(' ')
    .map((p: string) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      className="grid place-items-center font-bold shrink-0 rounded-2xl"
      style={{
        width: size,
        height: size,
        background: `oklch(0.85 0.1 ${hue})`,
        color: `oklch(0.28 0.07 ${hue})`,
        fontSize: size * 0.36,
      }}
    >
      {initials}
    </div>
  );
}

function RatingTile({ icon: Icon, label, value }: { icon: any; label: string; value: number | null }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="text-2xl font-bold text-gray-900">{value !== null ? value.toFixed(1) : '—'}</div>
        <Icon className="w-5 h-5 text-gray-500" />
      </div>
      <div className="mt-2 text-sm font-semibold text-gray-900">{label}</div>
    </div>
  );
}

export default function PublicTutorProfilePage() {
  const router = useRouter();
  const params = useParams();
  const tutorId = params.tutorId as string;
  const { isOpen: authPromptOpen, action: authAction, redirectUrl, promptAuth, closePrompt } = useAuthPrompt();

  const [tutor, setTutor] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<TutorProfile['subjects'][0] | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{ start: string; end: string } | null>(null);
  const [verifiedSubjectsModalOpen, setVerifiedSubjectsModalOpen] = useState(false);
  const [verifiedSubjects, setVerifiedSubjects] = useState<any[]>([]);
  const [csecSubjects, setCsecSubjects] = useState<any[]>([]);
  const [capeSubjects, setCapeSubjects] = useState<any[]>([]);
  const [showBookingPrompt, setShowBookingPrompt] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchTutorProfile();
    fetchVerifiedSubjects();
    checkAuth();
  }, [tutorId]);

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setIsAuthenticated(false);
      return;
    }
    setIsAuthenticated(true);
  }

  async function fetchVerifiedSubjects() {
    try {
      const res = await fetch(`/api/public/tutors/${tutorId}/verified-subjects`);
      const data = await res.json();
      if (data.is_verified) {
        setVerifiedSubjects(data.subjects || []);
        setCsecSubjects(data.grouped?.CSEC || []);
        setCapeSubjects(data.grouped?.CAPE || []);
      }
    } catch (err) {
      console.error('Error fetching verified subjects:', err);
    }
  }

  async function fetchTutorProfile() {
    try {
      const { data: tutorData, error: tutorError } = await supabase
        .from('profiles')
        .select('id, full_name, username, display_name, avatar_url, institution_id, country, bio, tutor_verification_status, created_at')
        .eq('id', tutorId)
        .eq('role', 'tutor')
        .single();

      if (tutorError) throw tutorError;
      if (!tutorData) {
        alert('Tutor not found');
        router.push('/');
        return;
      }

      const { data: tutorSubjects, error: subjectsError } = await supabase
        .from('tutor_subjects')
        .select('subject_id, price_per_hour_ttd')
        .eq('tutor_id', tutorId);

      if (subjectsError) throw subjectsError;

      const { data: allSubjects, error: allSubjectsError } = await supabase
        .from('subjects')
        .select('id, name, label, curriculum, level');

      if (allSubjectsError) throw allSubjectsError;

      const subjectsMap = new Map(allSubjects.map(s => [s.id, s]));

      const subjects = tutorSubjects
        .map(ts => {
          const subject = subjectsMap.get(ts.subject_id);
          return subject ? {
            id: subject.id,
            name: subject.label || subject.name,
            curriculum: subject.curriculum || subject.level || '',
            level: subject.level || '',
            price_per_hour_ttd: ts.price_per_hour_ttd,
          } : null;
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      const { data: ratingsData, error: ratingsError } = await supabase
        .from('ratings')
        .select('id, stars, comment, created_at, student_id, helpful_count')
        .eq('tutor_id', tutorId)
        .not('comment', 'is', null)
        .order('helpful_count', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (ratingsError) console.error('Error fetching ratings:', ratingsError);

      let ratings: TutorProfile['ratings'] = [];
      let avgRating = null;

      if (ratingsData && ratingsData.length > 0) {
        const studentIds = ratingsData.map(r => r.student_id);
        const { data: students, error: studentsError } = await supabase
          .from('profiles')
          .select('id, full_name, username, display_name')
          .in('id', studentIds);

        if (studentsError) console.error('Error fetching student names:', studentsError);

        const studentsMap = new Map(students?.map(s => [s.id, s]) || []);

        ratings = ratingsData.map(r => {
          const student = studentsMap.get(r.student_id);
          return {
            id: r.id,
            stars: r.stars,
            comment: r.comment,
            created_at: r.created_at,
            student_name: student ? getDisplayName(student) : 'Anonymous',
            helpful_count: r.helpful_count || 0,
          };
        });

        avgRating = ratingsData.reduce((sum, r) => sum + r.stars, 0) / ratingsData.length;
      }

      const { count, error: sessionsError } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('tutor_id', tutorId)
        .eq('status', 'COMPLETED_ASSUMED');

      if (!sessionsError && count !== null) {
        setCompletedSessions(count);
      }

      setTutor({
        ...tutorData,
        subjects,
        average_rating: avgRating,
        total_reviews: ratings.length,
        ratings,
      });
    } catch (error) {
      console.error('Error fetching tutor profile:', error);
      alert('Failed to load tutor profile');
    } finally {
      setLoading(false);
    }
  }

  const handleBookSession = () => {
    if (!selectedSubject || !selectedTimeSlot) {
      alert('Please select a subject and time slot');
      return;
    }
    if (!isAuthenticated) {
      promptAuth('book', `/tutors/${tutorId}`);
      return;
    }
    // Authenticated users go straight to the student booking page
    router.push(`/student/tutors/${tutorId}#book`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  if (!tutor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Tutor not found</p>
      </div>
    );
  }

  const displayName = getDisplayName(tutor);
  const hue = hashHue(tutor.id);
  const minPrice = tutor.subjects.length > 0
    ? Math.min(...tutor.subjects.map(s => s.price_per_hour_ttd))
    : 0;
  const isVerified = tutor.tutor_verification_status === 'verified';

  const scrollToBook = () => document.getElementById('book')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-gray-50 pb-20 lg:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-black bg-black shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex-shrink-0">
              <img src="/assets/logo/itutor-logo-dark.png" alt="iTutor" className="h-12 w-auto" />
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/signup" className="px-4 py-2 text-sm font-semibold text-white hover:text-itutor-green transition-colors">
                Sign Up
              </Link>
              <Link href="/login" className="px-4 py-2 text-sm font-semibold text-gray-900 bg-itutor-green hover:bg-emerald-500 rounded-lg transition-colors">
                Log In
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <button
          onClick={() => router.back()}
          className="mb-6 text-gray-500 hover:text-gray-900 inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to tutors
        </button>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
          {/* LEFT */}
          <div className="space-y-8">

            {/* Video intro banner */}
            <div
              className="relative aspect-video rounded-3xl overflow-hidden border border-gray-200"
              style={{ background: `linear-gradient(135deg, oklch(0.85 0.1 ${hue}), oklch(0.6 0.15 ${hue}))` }}
            >
              <div className="absolute inset-0 grid place-items-center">
                <button className="w-20 h-20 rounded-full bg-itutor-green text-white grid place-items-center shadow-lg hover:scale-105 transition-transform">
                  <Play className="w-9 h-9 fill-white ml-1" />
                </button>
              </div>
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur text-white px-3 py-1.5 rounded-full text-xs font-semibold">
                <Play className="w-3 h-3 fill-white" /> iTutor introduction
              </div>
            </div>

            {/* Identity */}
            <div className="flex items-start gap-4">
              <TutorSquareAvatar name={displayName} hue={hue} size={88} />
              <div className="flex-1 min-w-0 pt-1">
                <h1 className="text-4xl font-bold text-gray-900 leading-tight flex items-center gap-2 flex-wrap">
                  {displayName}
                  {isVerified && <BadgeCheck className="w-7 h-7 text-itutor-green shrink-0" />}
                </h1>
                <div className="mt-1 text-sm text-gray-500 flex items-center gap-1.5 flex-wrap">
                  {tutor.subjects.length > 0 && <span>{tutor.subjects[0].name} tutor</span>}
                  {tutor.subjects.length > 0 && tutor.country && <span>·</span>}
                  {tutor.country && <span>From {tutor.country}</span>}
                </div>
                {tutor.average_rating !== null && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    <span className="text-sm font-bold text-gray-900">{tutor.average_rating.toFixed(1)}</span>
                    <span className="text-sm text-gray-500">({tutor.total_reviews} reviews)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Highlights */}
            {(isVerified || tutor.subjects.length > 0 || completedSessions > 0) && (
              <div>
                <div className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
                  <Sparkles className="w-4 h-4 text-itutor-green" />
                  {displayName.split(' ')[0]}&apos;s highlights
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {isVerified && (
                    <span className="rounded-lg px-3 py-1.5 text-sm font-semibold bg-green-100 text-green-800">
                      Verified Tutor
                    </span>
                  )}
                  {tutor.subjects.slice(0, 4).map(s => (
                    <span key={s.id} className="rounded-lg px-3 py-1.5 text-sm font-semibold bg-blue-50 text-blue-800">
                      {s.name}
                    </span>
                  ))}
                  {completedSessions > 0 && (
                    <span className="rounded-lg px-3 py-1.5 text-sm font-semibold bg-purple-50 text-purple-800">
                      {completedSessions} sessions
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* More about me */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900">More about me</h2>
              {tutor.bio ? (
                <p className="mt-3 text-sm text-gray-800 leading-relaxed">{tutor.bio}</p>
              ) : (
                <p className="mt-3 text-sm text-gray-500">No bio provided yet.</p>
              )}
              <div className="mt-4 space-y-2 text-sm">
                {tutor.subjects.length > 0 && (
                  <div className="flex items-center gap-2 text-gray-900">
                    <GraduationCap className="w-4 h-4 text-gray-500 shrink-0" />
                    I teach:{' '}
                    <span className="font-semibold underline">{tutor.subjects.map(s => s.name).join(', ')}</span>
                  </div>
                )}
                {tutor.country && (
                  <div className="flex items-center gap-2 text-gray-900">
                    <span className="w-4 text-center text-gray-500 shrink-0 text-xs">🌍</span>
                    Based in {tutor.country}
                  </div>
                )}
              </div>
            </section>

            {/* Lesson rating tiles */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900">Lesson rating</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <RatingTile icon={Smile} label="Reassurance" value={tutor.average_rating} />
                <RatingTile icon={MessageCircle} label="Clarity" value={tutor.average_rating} />
                <RatingTile icon={Target} label="Progress" value={tutor.average_rating} />
                <RatingTile icon={Pencil} label="Preparation" value={tutor.average_rating} />
              </div>
              <div className="mt-3 text-xs text-gray-500">
                Based on {tutor.total_reviews} student {tutor.total_reviews === 1 ? 'review' : 'reviews'}
              </div>
            </section>

            {/* Reviews */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900">What my students say</h2>
              {tutor.average_rating !== null && (
                <div className="flex items-center gap-4 mt-4">
                  <span className="text-6xl font-bold text-gray-900 leading-none">
                    {tutor.average_rating.toFixed(1)}
                  </span>
                  <div className="w-14 h-14 rounded-full bg-amber-400 grid place-items-center shadow-md">
                    <Star className="w-8 h-8 fill-amber-600 text-amber-600" />
                  </div>
                </div>
              )}
              <div className="text-sm text-gray-500 mt-2">
                Based on {tutor.total_reviews} student {tutor.total_reviews === 1 ? 'review' : 'reviews'}
              </div>

              {tutor.ratings.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6 mt-6">
                  {tutor.ratings.slice(0, 4).map(rating => (
                    <div key={rating.id}>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl grid place-items-center font-bold text-sm shrink-0"
                          style={{
                            background: `oklch(0.85 0.1 ${hashHue(rating.student_name)})`,
                            color: `oklch(0.28 0.07 ${hashHue(rating.student_name)})`,
                          }}
                        >
                          {rating.student_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 text-sm">{rating.student_name}</div>
                          <div className="text-xs text-gray-500">
                            {new Date(rating.created_at).toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${i < rating.stars ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`}
                          />
                        ))}
                      </div>
                      {rating.comment && (
                        <p className="text-sm text-gray-800 mt-2 leading-relaxed">{rating.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6 py-8 text-center text-gray-500 text-sm">No reviews yet</div>
              )}
            </section>

            {/* Verified CXC Results */}
            {isVerified && verifiedSubjects.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Verified CXC Results</h2>
                {csecSubjects.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">CSEC</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {csecSubjects.map((s: any) => (
                        <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-3">
                          <div className="font-semibold text-gray-900 text-sm">{s.subject_name}</div>
                          <div className="text-xs text-itutor-green font-bold mt-0.5">Grade {s.grade}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {capeSubjects.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">CAPE</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {capeSubjects.map((s: any) => (
                        <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-3">
                          <div className="font-semibold text-gray-900 text-sm">{s.subject_name}</div>
                          <div className="text-xs text-purple-600 font-bold mt-0.5">Grade {s.grade}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <VerifiedSubjectsButton onClick={() => setVerifiedSubjectsModalOpen(true)} variant="secondary" />
              </section>
            )}

            {/* Book a lesson */}
            <section id="book" className="scroll-mt-20 space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Book a lesson</h2>
                <p className="text-sm text-gray-500 mt-1">Pick a subject and time for your first lesson.</p>
              </div>

              {/* Subject selector */}
              {tutor.subjects.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2">Select a subject</div>
                  <div className="flex flex-wrap gap-2">
                    {tutor.subjects.map(s => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSelectedSubject(s);
                          setSelectedTimeSlot(null);
                        }}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                          selectedSubject?.id === s.id
                            ? 'bg-itutor-green text-white border-itutor-green'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-itutor-green hover:text-itutor-green'
                        }`}
                      >
                        {s.name} · TTD ${s.price_per_hour_ttd}/hr
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Calendar */}
              {!selectedSubject ? (
                <div className="bg-white border border-gray-200 rounded-3xl p-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 grid place-items-center">
                    <GraduationCap className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-600 font-medium">Select a subject above to view available times</p>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-3xl p-5">
                  <TutorCalendarWidget
                    tutorId={tutorId}
                    onSlotSelect={(startAt, endAt) => setSelectedTimeSlot({ start: startAt, end: endAt })}
                  />
                  <button
                    onClick={handleBookSession}
                    disabled={!selectedTimeSlot}
                    className={`lg:hidden w-full mt-4 py-3.5 rounded-2xl font-bold text-base transition ${
                      selectedTimeSlot
                        ? 'bg-itutor-green text-white hover:bg-emerald-700'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedTimeSlot ? 'Continue to booking' : 'Pick a time to continue'}
                  </button>
                </div>
              )}
            </section>
          </div>

          {/* RIGHT — sticky booking sidebar */}
          <aside className="lg:sticky lg:top-20 self-start">
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-lg space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900">TTD ${minPrice}</span>
                <span className="text-sm text-gray-500">per hour</span>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-3 border-b border-gray-100">
                <div>
                  {tutor.average_rating !== null ? (
                    <>
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        <span className="text-xl font-bold text-gray-900">{tutor.average_rating.toFixed(1)}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{tutor.total_reviews} reviews</div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-400">No reviews yet</div>
                  )}
                </div>
                <div>
                  <div className="text-xl font-bold text-gray-900">{completedSessions.toLocaleString()}</div>
                  <div className="text-xs text-gray-500 mt-0.5">sessions</div>
                </div>
              </div>

              {/* Selection display */}
              <div className="rounded-2xl bg-gray-50 p-3 text-sm">
                <div className="text-xs text-gray-500">Your selection</div>
                {selectedSubject && selectedTimeSlot ? (
                  <div className="font-semibold text-gray-900 mt-1">
                    {selectedSubject.name} ·{' '}
                    {new Date(selectedTimeSlot.start).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                ) : (
                  <div className="text-gray-400 mt-1">
                    {!selectedSubject ? 'Pick a subject and time below' : 'Pick a time from the schedule below'}
                  </div>
                )}
              </div>

              {/* CTA */}
              {selectedSubject && selectedTimeSlot ? (
                <button
                  onClick={handleBookSession}
                  className="w-full py-3.5 rounded-2xl bg-itutor-green text-white font-bold hover:bg-emerald-700 transition"
                >
                  Continue to checkout
                </button>
              ) : (
                <button
                  onClick={scrollToBook}
                  className="w-full py-3.5 rounded-2xl bg-itutor-green text-white font-bold hover:bg-emerald-700 transition"
                >
                  Book trial lesson
                </button>
              )}

              {/* Quick actions */}
              <div className="grid grid-cols-3 gap-2">
                <Link
                  href="/messages"
                  className="rounded-xl border border-gray-200 py-3 grid place-items-center hover:bg-gray-50 transition"
                  title="Message"
                >
                  <MessageSquare className="w-4 h-4 text-gray-600" />
                </Link>
                <button
                  onClick={() => setSaved(!saved)}
                  className="rounded-xl border border-gray-200 py-3 grid place-items-center hover:bg-gray-50 transition"
                  title={saved ? 'Saved' : 'Save tutor'}
                >
                  <Heart className={`w-4 h-4 ${saved ? 'fill-red-500 text-red-500' : 'text-gray-600'}`} />
                </button>
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      navigator.clipboard?.writeText(window.location.href);
                    }
                  }}
                  className="rounded-xl border border-gray-200 py-3 grid place-items-center hover:bg-gray-50 transition"
                  title="Share"
                >
                  <Share2 className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              {/* Trust block */}
              <div className="rounded-2xl bg-green-50 p-4">
                <div className="flex items-center gap-2 font-bold text-green-900">
                  <ShieldCheck className="w-4 h-4 text-itutor-green" />
                  Not a match?
                </div>
                <div className="text-sm text-green-800 mt-1">You still have 2 free tutor trials.</div>
              </div>

              {/* Popularity */}
              {completedSessions > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-gray-900 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold text-gray-900">Popular tutor</div>
                    <div className="text-gray-500 text-xs">{completedSessions} sessions completed.</div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile floating bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-gray-900">TTD ${minPrice}</div>
          <div className="text-[11px] text-gray-500">per hour</div>
        </div>
        <button
          onClick={selectedSubject && selectedTimeSlot ? handleBookSession : scrollToBook}
          className="rounded-full bg-itutor-green text-white px-6 py-2.5 text-sm font-bold"
        >
          {selectedSubject && selectedTimeSlot ? 'Continue' : 'Book trial lesson'}
        </button>
      </div>

      {/* Verified Subjects Modal */}
      <VerifiedSubjectsModal
        isOpen={verifiedSubjectsModalOpen}
        onClose={() => setVerifiedSubjectsModalOpen(false)}
        tutorId={tutorId}
        tutorName={displayName}
        csecSubjects={csecSubjects}
        capeSubjects={capeSubjects}
      />

      {/* Auth Prompt Modal */}
      <AuthPromptModal
        isOpen={authPromptOpen}
        onClose={closePrompt}
        action={authAction}
        redirectUrl={redirectUrl}
      />

      {/* Sign Up Prompt Modal */}
      {showBookingPrompt && selectedSubject && selectedTimeSlot && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full relative border-4 border-itutor-green shadow-2xl">
            <button
              onClick={() => setShowBookingPrompt(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-itutor-green rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-2">Almost there!</h3>
              <p className="text-gray-600 mb-6">Sign up or log in to complete your booking</p>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6 text-left">
                <h4 className="font-bold text-gray-900 mb-3">Booking Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tutor:</span>
                    <span className="font-semibold text-gray-900">{displayName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subject:</span>
                    <span className="font-semibold text-gray-900">{selectedSubject.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Date:</span>
                    <span className="font-semibold text-gray-900">{new Date(selectedTimeSlot.start).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Time:</span>
                    <span className="font-semibold text-gray-900">
                      {new Date(selectedTimeSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &ndash;{' '}
                      {new Date(selectedTimeSlot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-200">
                    <span className="text-gray-600">Price:</span>
                    <span className="font-bold text-itutor-green text-lg">TTD ${selectedSubject.price_per_hour_ttd}/hr</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Link
                href="/signup"
                className="w-full px-6 py-4 bg-itutor-green hover:bg-emerald-700 text-white font-bold rounded-lg transition text-center"
              >
                Sign Up to Book
              </Link>
              <Link
                href="/login"
                className="w-full px-6 py-4 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:border-itutor-green hover:text-itutor-green hover:bg-green-50 transition text-center"
              >
                Already have an account? Log In
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
