'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AvatarUploadModal from '@/components/AvatarUploadModal';
import ProfileBannerUploadModal from '@/components/ProfileBannerUploadModal';
import AddSubjectModal from '@/components/tutor/AddSubjectModal';
import EditSubjectModal from '@/components/tutor/EditSubjectModal';
import EditProfileModal from '@/components/EditProfileModal';
import SentOffersList from '@/components/offers/SentOffersList';
import AvailabilityRequiredModal from '@/components/AvailabilityRequiredModal';
import ShareProfileModal from '@/components/ShareProfileModal';
import { useAvatarUpload } from '@/lib/hooks/useAvatarUpload';
import { useProfileBannerUpload } from '@/lib/hooks/useProfileBannerUpload';
import { getAvatarColor } from '@/lib/utils/avatarColors';
import { Session, TutorSubject, Subject, Rating } from '@/lib/types/database';
import { Area } from '@/lib/utils/imageCrop';
import { getDisplayName } from '@/lib/utils/displayName';
import { profileBannerDisplayUrl } from '@/lib/utils/profileBannerDisplayUrl';
import TutorReviewsModal from '@/components/tutor/TutorReviewsModal';
import UserAvatar from '@/components/UserAvatar';

type TutorSubjectWithSubject = TutorSubject & {
  subjects?: Subject;
};

type EnrichedSession = Session & {
  student_name?: string;
  subject_name?: string;
};

export default function TutorDashboard() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const testMode = searchParams.get('test') === 'true';
  const [sessions, setSessions] = useState<EnrichedSession[]>([]);
  const [tutorSubjects, setTutorSubjects] = useState<TutorSubjectWithSubject[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [sessionsTaught, setSessionsTaught] = useState(0);
  const [loadingData, setLoadingData] = useState(true);
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [addSubjectModalOpen, setAddSubjectModalOpen] = useState(false);
  const [editSubjectModalOpen, setEditSubjectModalOpen] = useState(false);
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<TutorSubjectWithSubject | null>(null);
  const [hasVideoProvider, setHasVideoProvider] = useState<boolean | null>(null);
  const [hasAvailability, setHasAvailability] = useState<boolean | null>(null);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const { uploadAvatar, uploading } = useAvatarUpload(profile?.id || '');
  const { uploadBanner, uploading: bannerUploading } = useProfileBannerUpload(profile?.id || '');
  const [paidClassesEnabled, setPaidClassesEnabled] = useState<boolean>(false);

  useEffect(() => {
    if (testMode) { setLoadingData(false); return; }
    if (loading) return;
    if (!loading && !profile) { router.push('/login'); return; }
    if (!loading && profile && profile.role !== 'tutor') { router.push('/login'); return; }
    if (!profile || profile.role !== 'tutor') return;

    async function checkOnboardingComplete() {
      if (!profile) return;
      const { data: subjects } = await supabase
        .from('tutor_subjects').select('id').eq('tutor_id', profile.id).limit(1);
      if (!subjects || subjects.length === 0) { router.push('/onboarding/tutor'); return; }
      fetchTutorData();
    }

    checkOnboardingComplete();
    fetchPaidClassesFlag();
  }, [profile, loading, router, testMode]);

  async function fetchPaidClassesFlag() {
    try {
      const res = await fetch('/api/feature-flags', { cache: 'no-store' });
      const data = await res.json();
      setPaidClassesEnabled(Boolean(data?.paidClassesEnabled));
    } catch { setPaidClassesEnabled(false); }
  }

  async function fetchTutorData() {
    if (!profile) return;
    try {
      const now = new Date().toISOString();
      const [sessionsRes, tutorSubjectsRes, allSubjectsRes, ratingsRes, videoProviderRes, availabilityRes] =
        await Promise.all([
          supabase.from('sessions').select('*, bookings(subject_id, status)')
            .eq('tutor_id', profile.id).gte('scheduled_start_at', now)
            .in('status', ['SCHEDULED', 'JOIN_OPEN']).order('scheduled_start_at', { ascending: true }).limit(10),
          supabase.from('tutor_subjects').select('*').eq('tutor_id', profile.id),
          supabase.from('subjects').select('*'),
          supabase.from('ratings').select('*').eq('tutor_id', profile.id),
          supabase.from('tutor_video_provider_connections').select('id, connection_status').eq('tutor_id', profile.id).single(),
          supabase.from('tutor_availability_rules').select('id').eq('tutor_id', profile.id).eq('is_active', true).limit(1),
        ]);

      if (sessionsRes.data) {
        const activeSessions = sessionsRes.data.filter(
          (s: any) => s.bookings?.status !== 'CANCELLED' && s.bookings?.status !== 'DECLINED'
        );
        const enrichedSessions = await Promise.all(
          activeSessions.slice(0, 5).map(async (session: any) => {
            const subjectId = session.bookings?.subject_id;
            const [studentRes, subjectRes] = await Promise.all([
              supabase.from('profiles').select('full_name, display_name').eq('id', session.student_id).single(),
              subjectId
                ? supabase.from('subjects').select('name, label, curriculum, level').eq('id', subjectId).single()
                : Promise.resolve({ data: null, error: null }),
            ]);
            return {
              ...session,
              student_name: studentRes.data ? getDisplayName(studentRes.data) : 'Unknown Student',
              subject_name: subjectRes.data ? (subjectRes.data.label || subjectRes.data.name || 'Unknown Subject') : 'Unknown Subject',
            };
          })
        );
        setSessions(enrichedSessions);
        const { count } = await supabase.from('sessions').select('*', { count: 'exact', head: true })
          .eq('tutor_id', profile.id).eq('status', 'COMPLETED_ASSUMED');
        setSessionsTaught(count || 0);
      }

      if (tutorSubjectsRes.data && allSubjectsRes.data) {
        const subjectsMap = new Map(allSubjectsRes.data.map((s: any) => [s.id, s]));
        setTutorSubjects(tutorSubjectsRes.data.map((ts: any) => ({ ...ts, subjects: subjectsMap.get(ts.subject_id) })));
      }

      if (ratingsRes.data) {
        const sorted = [...ratingsRes.data].sort((a: any, b: any) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        const seenStudents = new Set<string>();
        const unique = sorted.filter((r: any) => {
          if (!r?.student_id || seenStudents.has(r.student_id)) return false;
          seenStudents.add(r.student_id); return true;
        });
        setRatings(unique);
        if (unique.length > 0) {
          setAverageRating(Math.round(unique.reduce((s: number, r: any) => s + Number(r.stars || 0), 0) / unique.length * 10) / 10);
        }
      }

      setHasVideoProvider(
        !videoProviderRes.error && videoProviderRes.data?.connection_status === 'connected'
      );
      const noAvail = (availabilityRes.error?.code === 'PGRST116') || !availabilityRes.data?.length;
      setHasAvailability(!noAvail);
      setShowAvailabilityModal(noAvail);
    } catch (err) {
      console.error('Error fetching tutor data:', err);
    } finally {
      setLoadingData(false);
    }
  }

  const handleAvatarUpload = async (imageSrc: string, croppedArea: Area) => {
    if (!profile) return;
    const result = await uploadAvatar(imageSrc, croppedArea);
    if (result.success) window.location.reload();
  };

  const handleBannerUpload = async (imageSrc: string, croppedArea: Area) => {
    if (!profile) return;
    const result = await uploadBanner(imageSrc, croppedArea);
    if (result.success) window.location.reload();
  };

  if (!testMode && (loading || !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green" />
      </div>
    );
  }

  const displayName = testMode ? 'Test Tutor' : (profile ? getDisplayName(profile) : 'Tutor');
  const initials = displayName.slice(0, 2).toUpperCase();
  const subjectsLine = tutorSubjects.map(ts => ts.subjects?.name).filter(Boolean).join(' · ') || null;

  // Profile strength calculation
  const strengthItems = [
    { label: 'Profile created', done: true },
    { label: 'Profile photo uploaded', done: Boolean(profile?.avatar_url) },
    { label: 'Bio added', done: Boolean(profile?.bio?.trim()) },
    { label: 'Subjects added', done: tutorSubjects.length > 0 },
    { label: 'Availability set', done: Boolean(hasAvailability) },
    {
      label: 'Verification complete',
      done: profile?.tutor_verification_status === 'VERIFIED',
      warn: profile?.tutor_verification_status !== 'VERIFIED',
    },
  ];
  const strengthPct = Math.round((strengthItems.filter(i => i.done).length / strengthItems.length) * 100);

  return (
    <DashboardLayout role="tutor" userName={displayName}>
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── PROFILE BANNER ── */}
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          {testMode ? (
            <div className="h-28 shrink-0 bg-gradient-to-br from-gray-200 to-gray-300 sm:h-36" aria-hidden />
          ) : profile ? (
            <div className="relative h-28 shrink-0 sm:h-36">
              {profile.profile_banner_url ? (
                <img
                  src={profileBannerDisplayUrl(profile.profile_banner_url, profile.updated_at)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className={`h-full w-full bg-gradient-to-br ${getAvatarColor(profile.id)}`}
                  aria-hidden
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
              <button
                type="button"
                onClick={() => setBannerModalOpen(true)}
                className="absolute bottom-2 right-2 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200/80 backdrop-blur-sm transition hover:bg-white"
              >
                {profile.profile_banner_url ? 'Change banner' : 'Add banner'}
              </button>
            </div>
          ) : null}
          <div className="px-6 py-6">
            {/* Avatar row */}
            <div className="flex items-start gap-5 mb-5">
              <div
                className="relative w-[64px] h-[64px] rounded-2xl overflow-hidden flex-shrink-0 cursor-pointer shadow-sm"
                onClick={() => !testMode && setAvatarModalOpen(true)}
              >
                <UserAvatar avatarUrl={profile?.avatar_url} name={displayName} size={64} rounded="2xl" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl font-bold text-gray-900 leading-tight">{displayName}</h1>
                  <span className="px-2.5 py-0.5 bg-itutor-green/10 border border-itutor-green/30 text-itutor-green text-[11px] font-bold rounded-lg uppercase tracking-wide">
                    Tutor
                  </span>
                  {profile?.tutor_verification_status === 'VERIFIED' && (
                    <span className="px-2.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-600 text-[11px] font-bold rounded-lg uppercase tracking-wide">
                      Verified
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                  {profile?.school && (
                    <span className="text-[13px] text-gray-500 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5m-4 0h4" strokeWidth="1.8" />
                      </svg>
                      {profile.school}
                    </span>
                  )}
                  {subjectsLine && (
                    <span className="text-[13px] text-gray-400 truncate max-w-[340px]">{subjectsLine}</span>
                  )}
                </div>
              </div>
              {/* Rating */}
              <div className="hidden sm:flex flex-col items-end pb-1 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <svg className="w-5 h-5 text-amber-400 fill-amber-400" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  <span className="text-2xl font-bold text-amber-500">{averageRating > 0 ? averageRating.toFixed(1) : '0.0'}</span>
                </div>
                <button
                  onClick={() => ratings.length > 0 && setReviewsModalOpen(true)}
                  className="text-[12px] text-gray-400 hover:text-itutor-green transition-colors mt-0.5"
                >
                  {ratings.length} review{ratings.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>

            {/* Footer row */}
            <div className="flex items-center gap-3 flex-wrap pt-4 border-t border-gray-100">
              {/* Notice strip */}
              {!paidClassesEnabled && (
                <div className="flex-1 min-w-[220px] flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" strokeWidth="1.8" />
                  </svg>
                  <div>
                    <p className="text-[12px] font-semibold text-amber-700">Paid classes launching soon</p>
                    <p className="text-[11px] text-amber-600">During our initial launch period, tutors can host free classes only.</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  onClick={() => !testMode && setEditProfileModalOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 hover:border-itutor-green hover:text-itutor-green text-gray-600 text-[13px] font-semibold rounded-xl transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" strokeWidth="2" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" strokeWidth="2" />
                  </svg>
                  Edit Profile
                </button>
                <button
                  onClick={() => !testMode && setAddSubjectModalOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 hover:border-itutor-green hover:text-itutor-green text-gray-600 text-[13px] font-semibold rounded-xl transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <line x1="12" y1="5" x2="12" y2="19" strokeWidth="2" />
                    <line x1="5" y1="12" x2="19" y2="12" strokeWidth="2" />
                  </svg>
                  Add Subject
                </button>
                <button
                  onClick={() => !testMode && setShareModalOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-itutor-green hover:bg-emerald-500 text-black text-[13px] font-semibold rounded-xl transition-colors shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" strokeWidth="2" />
                    <polyline points="16 6 12 2 8 6" strokeWidth="2" />
                    <line x1="12" y1="2" x2="12" y2="15" strokeWidth="2" />
                  </svg>
                  Share Profile
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── STATS ROW ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Sessions Taught */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-itutor-green/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 0 0 1.946-.806 3.42 3.42 0 0 1 4.438 0 3.42 3.42 0 0 0 1.946.806 3.42 3.42 0 0 1 3.138 3.138 3.42 3.42 0 0 0 .806 1.946 3.42 3.42 0 0 1 0 4.438 3.42 3.42 0 0 0-.806 1.946 3.42 3.42 0 0 1-3.138 3.138 3.42 3.42 0 0 0-1.946.806 3.42 3.42 0 0 1-4.438 0 3.42 3.42 0 0 0-1.946-.806 3.42 3.42 0 0 1-3.138-3.138 3.42 3.42 0 0 0-.806-1.946 3.42 3.42 0 0 1 0-4.438 3.42 3.42 0 0 0 .806-1.946 3.42 3.42 0 0 1 3.138-3.138z" strokeWidth="1.8" />
              </svg>
            </div>
            <div>
              <p className="text-3xl font-bold text-itutor-green">{loadingData ? '—' : sessionsTaught}</p>
              <p className="text-[12px] text-gray-400 font-medium mt-0.5">Sessions Taught</p>
            </div>
          </div>

          {/* Subjects Teaching */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" strokeWidth="1.8" />
              </svg>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-500">{loadingData ? '—' : tutorSubjects.length}</p>
              <p className="text-[12px] text-gray-400 font-medium mt-0.5">Subjects Teaching</p>
            </div>
          </div>

          {/* Total Reviews */}
          <button
            onClick={() => ratings.length > 0 && setReviewsModalOpen(true)}
            className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:border-amber-200 transition-colors text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5z" strokeWidth="1.8" />
              </svg>
            </div>
            <div>
              <p className="text-3xl font-bold text-amber-500">{loadingData ? '—' : ratings.length}</p>
              <p className="text-[12px] text-gray-400 font-medium mt-0.5">Total Reviews</p>
            </div>
          </button>
        </div>

        {/* ── MAIN GRID ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start">

          {/* LEFT COLUMN */}
          <div className="space-y-5">

            {/* Sent Offers */}
            {!testMode && profile && <SentOffersList tutorId={profile.id} />}

            {/* Subjects You Teach */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" strokeWidth="1.8" />
                    </svg>
                  </div>
                  <h2 className="text-[15px] font-bold text-gray-900">Subjects You Teach</h2>
                </div>
                <button
                  onClick={() => !testMode && setAddSubjectModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-itutor-green text-black text-[12px] font-bold rounded-xl hover:bg-emerald-500 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <line x1="12" y1="5" x2="12" y2="19" strokeWidth="2.5" />
                    <line x1="5" y1="12" x2="19" y2="12" strokeWidth="2.5" />
                  </svg>
                  Add Subject
                </button>
              </div>

              {loadingData ? (
                <p className="text-sm text-gray-400">Loading subjects…</p>
              ) : tutorSubjects.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                  {tutorSubjects.map((ts) => (
                    <button
                      key={ts.id}
                      onClick={() => { setSelectedSubject(ts); setEditSubjectModalOpen(true); }}
                      className="group relative bg-gray-50 border border-gray-100 hover:border-itutor-green rounded-xl p-3 text-left transition-all hover:shadow-sm overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-itutor-green to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="flex items-start justify-between gap-1 mb-2">
                        <p className="text-[13px] font-bold text-gray-900 group-hover:text-itutor-green transition-colors leading-tight">
                          {ts.subjects?.name || 'Unknown Subject'}
                        </p>
                        <svg className="w-3 h-3 text-gray-300 group-hover:text-itutor-green flex-shrink-0 mt-0.5 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M9 18l6-6-6-6" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                      </div>
                      <div className="flex gap-1 mb-2 flex-wrap">
                        {ts.subjects?.curriculum && (
                          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-500">
                            {ts.subjects.curriculum}
                          </span>
                        )}
                        {ts.subjects?.level && ts.subjects?.level !== ts.subjects?.curriculum && (
                          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-500">
                            {ts.subjects.level}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold text-itutor-green">
                          TT${paidClassesEnabled ? ts.price_per_hour_ttd : 0}
                        </span>
                        {!paidClassesEnabled && (
                          <span className="px-1 py-0.5 bg-itutor-green/10 text-itutor-green text-[9px] font-bold rounded">FREE</span>
                        )}
                        <span className="text-[10px] text-gray-400">/hr</span>
                      </div>
                    </button>
                  ))}

                  {/* Add new placeholder */}
                  <button
                    onClick={() => !testMode && setAddSubjectModalOpen(true)}
                    className="border border-dashed border-itutor-green/30 hover:border-itutor-green hover:bg-itutor-green/5 rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 min-h-[80px] transition-all group"
                  >
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-itutor-green transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <line x1="12" y1="5" x2="12" y2="19" strokeWidth="2" />
                      <line x1="5" y1="12" x2="19" y2="12" strokeWidth="2" />
                    </svg>
                    <span className="text-[12px] font-semibold text-gray-400 group-hover:text-itutor-green transition-colors">Add Subject</span>
                  </button>
                </div>
              ) : (
                <div className="text-center py-10">
                  <div className="w-14 h-14 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" strokeWidth="1.8" />
                    </svg>
                  </div>
                  <p className="text-[14px] font-semibold text-gray-700 mb-1">No subjects added yet</p>
                  <p className="text-[12px] text-gray-400 mb-4">Add the subjects you teach to attract students.</p>
                  <button
                    onClick={() => !testMode && setAddSubjectModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-itutor-green text-black text-[13px] font-bold rounded-xl hover:bg-emerald-500 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <line x1="12" y1="5" x2="12" y2="19" strokeWidth="2.5" />
                      <line x1="5" y1="12" x2="19" y2="12" strokeWidth="2.5" />
                    </svg>
                    Add Your First Subject
                  </button>
                </div>
              )}
            </div>

            {/* Upcoming Sessions */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-itutor-green/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="1.8" />
                      <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h2 className="text-[15px] font-bold text-gray-900">Upcoming Sessions</h2>
                </div>
                <Link href="/tutor/bookings" className="text-[13px] text-blue-500 font-semibold hover:text-blue-600 transition-colors">
                  View all →
                </Link>
              </div>

              {loadingData ? (
                <p className="text-sm text-gray-400">Loading sessions…</p>
              ) : sessions.length > 0 ? (
                <div className="space-y-3">
                  {sessions.map((session) => {
                    const status = session.status?.toUpperCase();
                    let label = 'Upcoming';
                    let labelClass = 'bg-blue-50 text-blue-600';
                    if (status === 'JOIN_OPEN' || status === 'IN_PROGRESS') { label = 'In Progress'; labelClass = 'bg-purple-50 text-purple-600'; }
                    else if (status === 'COMPLETED' || status === 'COMPLETED_ASSUMED') { label = 'Completed'; labelClass = 'bg-itutor-green/10 text-itutor-green'; }
                    else if (status === 'CANCELLED') { label = 'Cancelled'; labelClass = 'bg-red-50 text-red-500'; }

                    return (
                      <div key={session.id} className="flex items-center gap-4 p-4 bg-gray-50 border border-gray-100 rounded-xl">
                        <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4.5 h-4.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="1.8" />
                            <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-[14px] font-semibold text-gray-900 truncate">{session.subject_name}</p>
                            <span className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-md ${labelClass}`}>{label}</span>
                          </div>
                          <p className="text-[12px] text-gray-400">
                            with <span className="text-itutor-green font-semibold">{session.student_name}</span>
                            {' · '}
                            {new Date(session.scheduled_start_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            {' · '}
                            {new Date(session.scheduled_start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center py-4 text-center">
                  <div className="w-14 h-14 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="1.8" />
                      <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="text-[14px] font-semibold text-gray-700 mb-1">No sessions yet</p>
                  <p className="text-[12px] text-gray-400">Once a student books with you, it&apos;ll appear here.</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-5">

            {/* Quick Actions */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2 className="text-[15px] font-bold text-gray-900">Quick Actions</h2>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    href: '/tutor/availability',
                    icon: (
                      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" strokeWidth="1.8" />
                        <path d="M12 6v6l4 2" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    ),
                    iconBg: 'bg-purple-50 text-purple-500',
                    title: 'Set Availability',
                    desc: 'Set your available hours',
                  },
                  {
                    href: '/tutor/curriculum',
                    icon: (
                      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" strokeWidth="1.8" />
                        <path d="M8 7h8M8 11h5" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    ),
                    iconBg: 'bg-blue-50 text-blue-500',
                    title: 'Curriculum',
                    desc: 'Browse CSEC subjects',
                  },
                  {
                    href: '/tutor/verification',
                    icon: (
                      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeWidth="1.8" />
                      </svg>
                    ),
                    iconBg: 'bg-orange-50 text-orange-500',
                    title: 'Verification',
                    desc: (
                      <>
                        Upload certificates{' '}
                        {profile?.tutor_verification_status !== 'VERIFIED' && (
                          <span className="text-orange-500 font-semibold">· Action needed</span>
                        )}
                      </>
                    ),
                    highlight: profile?.tutor_verification_status !== 'VERIFIED',
                  },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3.5 p-3.5 rounded-xl border transition-all hover:translate-x-0.5 ${
                      item.highlight
                        ? 'border-orange-100 hover:border-orange-200'
                        : 'border-gray-100 hover:border-gray-200'
                    } group`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold text-gray-900">{item.title}</p>
                      <p className="text-[12px] text-gray-400">{item.desc}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>

            {/* Profile Strength */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl bg-itutor-green/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" strokeWidth="1.8" />
                  </svg>
                </div>
                <h2 className="text-[15px] font-bold text-gray-900">Profile Strength</h2>
              </div>

              <div className="flex justify-between text-[12px] mb-2">
                <span className="text-gray-400">
                  {strengthPct < 50 ? 'Getting there…' : strengthPct < 100 ? 'Almost there!' : 'Complete!'}
                </span>
                <span className="text-itutor-green font-bold">{strengthPct}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-5">
                <div
                  className="h-full bg-gradient-to-r from-itutor-green to-emerald-400 rounded-full transition-all duration-700"
                  style={{ width: `${strengthPct}%` }}
                />
              </div>

              <div className="space-y-2.5">
                {strengthItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-2.5 text-[12px]">
                    <div
                      className={`w-4.5 h-4.5 rounded-full flex items-center justify-center flex-shrink-0 ${
                        item.done
                          ? 'bg-itutor-green/10 border border-itutor-green/40'
                          : item.warn
                          ? 'bg-orange-50 border border-orange-300'
                          : 'bg-gray-50 border border-gray-200'
                      }`}
                    >
                      {item.done ? (
                        <svg className="w-2.5 h-2.5 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                      ) : item.warn ? (
                        <span className="text-[8px] font-bold text-orange-500">!</span>
                      ) : null}
                    </div>
                    <span className={item.done ? 'text-gray-700' : 'text-gray-400'}>{item.label}</span>
                  </div>
                ))}
              </div>

              {strengthPct < 100 && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-orange-50 border border-orange-200 px-3 py-2.5">
                  <svg className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <p className="text-[11px] leading-snug text-orange-600 font-medium">
                    Your profile will only be visible to students once your profile strength reaches 100%.
                  </p>
                </div>
              )}
            </div>

            {/* Getting Started */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl bg-itutor-green/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" strokeWidth="1.8" />
                  </svg>
                </div>
                <h2 className="text-[15px] font-bold text-gray-900">Getting Started</h2>
              </div>

              <div className="space-y-0">
                {[
                  { n: 1, text: <><strong className="text-gray-900">Complete verification</strong> — Upload your certificates to build trust with students.</> },
                  { n: 2, text: <><strong className="text-gray-900">Set your availability</strong> — Tell students when you&apos;re free to teach.</> },
                  { n: 3, text: <><strong className="text-gray-900">Share your profile</strong> — Send your profile link to attract your first students.</> },
                  { n: 4, text: <><strong className="text-gray-900">Earn reviews</strong> — Your first review will unlock the rating badge. 🌟</> },
                ].map((tip, i, arr) => (
                  <div key={tip.n} className={`flex gap-3 py-3 ${i < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                    <div className="w-6 h-6 rounded-lg bg-itutor-green/10 text-itutor-green text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {tip.n}
                    </div>
                    <p className="text-[13px] text-gray-500 leading-relaxed">{tip.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODALS ── */}
      <AvatarUploadModal isOpen={avatarModalOpen} onClose={() => setAvatarModalOpen(false)} onUpload={handleAvatarUpload} uploading={uploading} />
      <ProfileBannerUploadModal
        isOpen={bannerModalOpen}
        onClose={() => setBannerModalOpen(false)}
        onUpload={handleBannerUpload}
        uploading={bannerUploading}
      />

      {!testMode && profile && (
        <>
          <AddSubjectModal
            isOpen={addSubjectModalOpen}
            onClose={() => setAddSubjectModalOpen(false)}
            tutorId={profile.id}
            existingSubjectIds={tutorSubjects.map(ts => ts.subject_id)}
            onSubjectAdded={() => { setAddSubjectModalOpen(false); fetchTutorData(); }}
          />
          <EditSubjectModal
            isOpen={editSubjectModalOpen}
            onClose={() => setEditSubjectModalOpen(false)}
            tutorSubject={selectedSubject}
            onSubjectUpdated={() => { setEditSubjectModalOpen(false); fetchTutorData(); }}
            onSubjectDeleted={() => { setEditSubjectModalOpen(false); fetchTutorData(); }}
          />
          <EditProfileModal
            isOpen={editProfileModalOpen}
            onClose={() => setEditProfileModalOpen(false)}
            profile={profile}
            onSuccess={() => window.location.reload()}
          />
          <ShareProfileModal
            isOpen={shareModalOpen}
            onClose={() => setShareModalOpen(false)}
            profileUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/tutors/${profile.id}`}
            profileName={getDisplayName(profile)}
          />
          {hasVideoProvider === true && hasAvailability === false && showAvailabilityModal && (
            <AvailabilityRequiredModal isOpen={true} onClose={() => setShowAvailabilityModal(false)} />
          )}
          <TutorReviewsModal tutorId={profile.id} isOpen={reviewsModalOpen} onClose={() => setReviewsModalOpen(false)} />
        </>
      )}
    </DashboardLayout>
  );
}
