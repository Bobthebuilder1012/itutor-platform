'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import ProfileHeader from '@/components/ProfileHeader';
import AvatarUploadModal from '@/components/AvatarUploadModal';
import AddSubjectModal from '@/components/tutor/AddSubjectModal';
import EditSubjectModal from '@/components/tutor/EditSubjectModal';
import EditProfileModal from '@/components/EditProfileModal';
import SentOffersList from '@/components/offers/SentOffersList';
import VideoProviderRequiredModal from '@/components/VideoProviderRequiredModal';
import ShareProfileModal from '@/components/ShareProfileModal';
import { useAvatarUpload } from '@/lib/hooks/useAvatarUpload';
import { Session, TutorSubject, Subject, Rating } from '@/lib/types/database';
import { Area } from '@/lib/utils/imageCrop';
import { getDisplayName } from '@/lib/utils/displayName';
import PaidClassesLockNotice from '@/components/tutor/PaidClassesLockNotice';
import TutorReviewsModal from '@/components/tutor/TutorReviewsModal';

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
  const [addSubjectModalOpen, setAddSubjectModalOpen] = useState(false);
  const [editSubjectModalOpen, setEditSubjectModalOpen] = useState(false);
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<TutorSubjectWithSubject | null>(null);
  const [hasVideoProvider, setHasVideoProvider] = useState<boolean | null>(null);
  const { uploadAvatar, uploading } = useAvatarUpload(profile?.id || '');
  const [verifiedSubjects, setVerifiedSubjects] = useState<any[]>([]);
  const [csecSubjects, setCsecSubjects] = useState<any[]>([]);
  const [capeSubjects, setCapeSubjects] = useState<any[]>([]);
  const [paidClassesEnabled, setPaidClassesEnabled] = useState<boolean>(false);

  useEffect(() => {
    if (testMode) {
      setLoadingData(false);
      return;
    }

    if (loading) return;
    
    // Only redirect if loading is complete and there's definitely no profile
    if (!loading && !profile) {
      router.push('/login');
      return;
    }

    // Only redirect if we have a profile but it's the wrong role
    if (!loading && profile && profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    // Only proceed with onboarding check if we have a valid profile
    if (!profile || profile.role !== 'tutor') {
      return;
    }

    // Check if onboarding is complete by verifying school and subjects exist
    async function checkOnboardingComplete() {
      if (!profile) return;
      
      console.log('Checking onboarding status for tutor:', profile.id);
      console.log('Profile school:', profile.school);
      
      if (!profile.school) {
        console.log('No school found, redirecting to onboarding');
        router.push('/onboarding/tutor');
        return;
      }

      // Check if tutor has any subjects
      const { data: subjects, error: subjectsError } = await supabase
        .from('tutor_subjects')
        .select('id')
        .eq('tutor_id', profile.id)
        .limit(1);

      console.log('Tutor subjects check:', subjects, 'Error:', subjectsError);

      if (!subjects || subjects.length === 0) {
        console.log('No subjects found, redirecting to onboarding');
        router.push('/onboarding/tutor');
        return;
      }

      console.log('Onboarding complete, fetching tutor data');
      fetchTutorData();
    }

    checkOnboardingComplete();
    fetchVerifiedSubjects();
    fetchPaidClassesFlag();
  }, [profile, loading, router, testMode]);

  async function fetchPaidClassesFlag() {
    try {
      const res = await fetch('/api/feature-flags', { cache: 'no-store' });
      const data = await res.json();
      setPaidClassesEnabled(Boolean(data?.paidClassesEnabled));
    } catch {
      setPaidClassesEnabled(false);
    }
  }

  async function fetchVerifiedSubjects() {
    if (!profile?.id) return;
    
    try {
      const res = await fetch(`/api/public/tutors/${profile.id}/verified-subjects`);
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

  async function fetchTutorData() {
    if (!profile) return;

    try {
      // Fetch tutor_subjects and subjects separately to avoid FK join issues
      const now = new Date().toISOString();
      const [sessionsRes, tutorSubjectsRes, allSubjectsRes, ratingsRes, videoProviderRes] = await Promise.all([
        supabase
          .from('sessions')
          .select('*, bookings(subject_id, status)')
          .eq('tutor_id', profile.id)
          .gte('scheduled_start_at', now)
          .in('status', ['SCHEDULED', 'JOIN_OPEN'])
          .order('scheduled_start_at', { ascending: true })
          .limit(10),
        supabase
          .from('tutor_subjects')
          .select('*')
          .eq('tutor_id', profile.id),
        supabase
          .from('subjects')
          .select('*'),
        supabase
          .from('ratings')
          .select('*')
          .eq('tutor_id', profile.id),
        supabase
          .from('tutor_video_provider_connections')
          .select('id, connection_status')
          .eq('tutor_id', profile.id)
          .single()
      ]);

      console.log('Tutor subjects response:', tutorSubjectsRes);
      console.log('All subjects response:', allSubjectsRes);

      if (tutorSubjectsRes.error) {
        console.error('Tutor subjects error:', tutorSubjectsRes.error);
      }

      if (sessionsRes.data) {
        // Filter out cancelled bookings first
        const activeSessions = sessionsRes.data.filter((session: any) => 
          session.bookings?.status !== 'CANCELLED' && 
          session.bookings?.status !== 'DECLINED'
        );

        // Enrich sessions with student and subject names
        const enrichedSessions = await Promise.all(
          activeSessions.slice(0, 5).map(async (session: any) => {
            const subjectId = session.bookings?.subject_id;
            
            const [studentRes, subjectRes] = await Promise.all([
              supabase.from('profiles').select('full_name, display_name').eq('id', session.student_id).single(),
              subjectId 
                ? supabase.from('subjects').select('name, label, curriculum, level').eq('id', subjectId).single()
                : Promise.resolve({ data: null, error: null })
            ]);

            // Get subject name
            const subjectName = subjectRes.data 
              ? (subjectRes.data.label || subjectRes.data.name || 'Unknown Subject')
              : 'Unknown Subject';

            return {
              ...session,
              student_name: studentRes.data ? getDisplayName(studentRes.data) : 'Unknown Student',
              subject_name: subjectName
            };
          })
        );
        
        setSessions(enrichedSessions);
        
        // Fetch completed sessions count separately
        const { count: completedCount } = await supabase
          .from('sessions')
          .select('*', { count: 'exact', head: true })
          .eq('tutor_id', profile.id)
          .eq('status', 'COMPLETED_ASSUMED');
        setSessionsTaught(completedCount || 0);
      }
      
      // Manually join tutor_subjects with subjects data
      if (tutorSubjectsRes.data && allSubjectsRes.data) {
        const subjectsMap = new Map(allSubjectsRes.data.map(s => [s.id, s]));
        const enrichedTutorSubjects = tutorSubjectsRes.data.map(ts => ({
          ...ts,
          subjects: subjectsMap.get(ts.subject_id)
        }));
        console.log('Enriched tutor subjects:', enrichedTutorSubjects);
        setTutorSubjects(enrichedTutorSubjects);
      }
      
      if (ratingsRes.data) {
        // Defensive: if legacy duplicates exist (same student rated multiple times),
        // treat only the latest rating per student as the "current" review.
        const sorted = [...ratingsRes.data].sort((a: any, b: any) => {
          const ta = new Date(a.created_at || 0).getTime();
          const tb = new Date(b.created_at || 0).getTime();
          return tb - ta;
        });

        const seenStudents = new Set<string>();
        const uniqueLatest = sorted.filter((r: any) => {
          const sid = r?.student_id;
          if (!sid) return false;
          if (seenStudents.has(sid)) return false;
          seenStudents.add(sid);
          return true;
        });

        setRatings(uniqueLatest);
        if (uniqueLatest.length > 0) {
          const avgStars = uniqueLatest.reduce((sum: number, r: any) => sum + Number(r.stars || 0), 0) / uniqueLatest.length;
          setAverageRating(Math.round(avgStars * 10) / 10);
        }
      }

      // Check video provider connection
      if (videoProviderRes.error && videoProviderRes.error.code === 'PGRST116') {
        // No connection found
        setHasVideoProvider(false);
      } else if (videoProviderRes.data && videoProviderRes.data.connection_status === 'connected') {
        setHasVideoProvider(true);
      } else {
        setHasVideoProvider(false);
      }
    } catch (error) {
      console.error('Error fetching tutor data:', error);
    } finally {
      setLoadingData(false);
    }
  }

  if (!testMode && (loading || !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const displayName = testMode ? 'Test Tutor' : (profile ? getDisplayName(profile) : 'Tutor');
  const subjectsLine = testMode
    ? 'CSEC Math · CAPE Physics'
    : tutorSubjects.length > 0
      ? tutorSubjects.map(ts => ts.subjects?.name).filter(Boolean).join(' · ')
      : null;

  const handleAvatarUpload = async (imageSrc: string, croppedArea: Area) => {
    if (!profile) return;
    
    const result = await uploadAvatar(imageSrc, croppedArea);
    if (result.success) {
      // Refresh the page to show new avatar
      window.location.reload();
    }
  };

  return (
    <DashboardLayout role="tutor" userName={displayName}>
      {/* Video Provider Warning */}
      {!testMode && hasVideoProvider === false && (
        <div className="px-4 sm:px-6 lg:px-8 pt-4">
          <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-500 rounded-full flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-red-900 mb-2">⚠️ Video Provider Not Connected</h3>
                <p className="text-red-800 mb-4">
                  You cannot accept new bookings until you connect Google Meet or Zoom. Students need a way to join your sessions!
                </p>
                <Link
                  href="/tutor/video-setup"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg font-bold transition shadow-lg hover:shadow-xl"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Connect Video Provider Now
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}


      <div className="px-4 py-3 sm:px-0">
        {/* Test Mode Banner */}
        {testMode && (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-amber-700">
                  <strong>Test Mode:</strong> You're viewing the dashboard UI only. Real data requires authentication.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Profile Header */}
        <ProfileHeader
          fullName={displayName}
          role="tutor"
          school={testMode ? 'University of the West Indies' : profile?.school}
          country={testMode ? 'Trinidad & Tobago' : profile?.country}
          subjectsLine={subjectsLine}
          bio={profile?.bio}
          ratingAverage={testMode ? 4.8 : averageRating}
          ratingCount={testMode ? 35 : ratings.length}
          avatarUrl={profile?.avatar_url}
          onAvatarClick={() => setAvatarModalOpen(true)}
          isVerified={profile?.tutor_verification_status === 'VERIFIED'}
        />

        {/* Quick Action Buttons */}
        {!testMode && (
          <div className="mb-6 flex flex-wrap gap-3">
            {!paidClassesEnabled && (
              <div className="w-full">
                <PaidClassesLockNotice />
              </div>
            )}
            <button
              onClick={() => setEditProfileModalOpen(true)}
              className="px-4 py-2 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-black rounded-lg font-semibold transition flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Edit Profile
            </button>
            <button
              onClick={() => setAddSubjectModalOpen(true)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-itutor-white border border-gray-700 rounded-lg font-medium transition flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Subject
            </button>
            <button
              onClick={() => setShareModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white border border-blue-500 rounded-lg font-medium transition flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share Profile
            </button>
          </div>
        )}

        {/* Avatar Upload Modal */}
        <AvatarUploadModal
          isOpen={avatarModalOpen}
          onClose={() => setAvatarModalOpen(false)}
          onUpload={handleAvatarUpload}
          uploading={uploading}
        />

        {/* Add Subject Modal */}
        <AddSubjectModal
          isOpen={addSubjectModalOpen}
          onClose={() => setAddSubjectModalOpen(false)}
          tutorId={profile?.id || ''}
          existingSubjectIds={tutorSubjects.map(ts => ts.subject_id)}
          onSubjectAdded={() => {
            setAddSubjectModalOpen(false);
            fetchTutorData();
          }}
        />

        {/* Edit Subject Modal */}
        <EditSubjectModal
          isOpen={editSubjectModalOpen}
          onClose={() => setEditSubjectModalOpen(false)}
          tutorSubject={selectedSubject}
          onSubjectUpdated={() => {
            setEditSubjectModalOpen(false);
            fetchTutorData();
          }}
          onSubjectDeleted={() => {
            setEditSubjectModalOpen(false);
            fetchTutorData();
          }}
        />

        {/* Edit Profile Modal */}
        {!testMode && profile && (
          <EditProfileModal
            isOpen={editProfileModalOpen}
            onClose={() => setEditProfileModalOpen(false)}
            profile={profile}
            onSuccess={() => window.location.reload()}
          />
        )}

        {/* Share Profile Modal */}
        {!testMode && profile && (
          <ShareProfileModal
            isOpen={shareModalOpen}
            onClose={() => setShareModalOpen(false)}
            profileUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/tutors/${profile.id}`}
            profileName={getDisplayName(profile)}
          />
        )}

        {/* Video Provider Required Modal */}
        {!testMode && hasVideoProvider === false && (
          <VideoProviderRequiredModal isOpen={true} />
        )}

        {/* Verified CXC Results Section */}
        {!testMode && profile?.tutor_verification_status === 'VERIFIED' && verifiedSubjects.length > 0 && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 shadow-xl rounded-2xl p-6 mb-6 hover:shadow-green-300/50 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Your Verified CXC Results</h2>
                  <p className="text-sm text-gray-600">These are visible on your public profile</p>
                </div>
              </div>
              <Link
                href="/tutor/verification/manage-subjects"
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Manage
              </Link>
            </div>
            
            <div className="space-y-6">
              {/* CSEC Subjects */}
              {csecSubjects.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-lg font-bold text-gray-900">CSEC</h3>
                    <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded">
                      {csecSubjects.length} {csecSubjects.length === 1 ? 'subject' : 'subjects'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {csecSubjects.map((subject: any) => (
                      <div key={subject.id} className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-green-400 hover:shadow-md transition-all">
                        <h4 className="font-semibold text-gray-900 mb-2">{subject.subjects.name}</h4>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-sm font-bold text-green-700">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                            Grade {subject.grade}
                          </span>
                          {subject.year && (
                            <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                              {subject.year}
                            </span>
                          )}
                          {subject.session && (
                            <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                              {subject.session}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CAPE Subjects */}
              {capeSubjects.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-lg font-bold text-gray-900">CAPE</h3>
                    <span className="bg-purple-100 text-purple-800 text-xs font-semibold px-2 py-1 rounded">
                      {capeSubjects.length} {capeSubjects.length === 1 ? 'subject' : 'subjects'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {capeSubjects.map((subject: any) => (
                      <div key={subject.id} className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-green-400 hover:shadow-md transition-all">
                        <h4 className="font-semibold text-gray-900 mb-2">{subject.subjects.name}</h4>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-sm font-bold text-green-700">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                            Grade {subject.grade}
                          </span>
                          {subject.year && (
                            <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                              {subject.year}
                            </span>
                          )}
                          {subject.session && (
                            <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                              {subject.session}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-green-200">
              <p className="text-xs text-gray-600 text-center">
                Results verified by iTutor. Students and parents can see these on your profile.
              </p>
            </div>
          </div>
        )}

        {/* Teaching Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white border-2 border-green-200 shadow-lg rounded-2xl p-6 hover:shadow-green-300/50 hover:scale-105 transition-all duration-300 group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 mb-2 font-medium">Sessions Taught</p>
                <p className="text-4xl font-bold text-green-600">
                  {loadingData ? '...' : sessionsTaught}
                </p>
              </div>
              <div className="bg-gradient-to-br from-itutor-green to-emerald-600 rounded-2xl p-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white border-2 border-blue-200 shadow-lg rounded-2xl p-6 hover:shadow-blue-300/50 hover:scale-105 transition-all duration-300 group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 mb-2 font-medium">Subjects Teaching</p>
                <p className="text-4xl font-bold text-blue-600">
                  {loadingData ? '...' : tutorSubjects.length}
                </p>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (ratings.length > 0) setReviewsModalOpen(true);
            }}
            disabled={ratings.length === 0}
            className={`bg-white border-2 border-purple-200 shadow-lg rounded-2xl p-6 transition-all duration-300 group text-left ${
              ratings.length === 0
                ? 'opacity-60 cursor-not-allowed'
                : 'hover:shadow-purple-300/50 hover:scale-105'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 mb-2 font-medium">Total Reviews</p>
                <p className="text-4xl font-bold text-purple-600">
                  {loadingData ? '...' : ratings.length}
                </p>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                <svg className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
            </div>
          </button>
        </div>

        {/* Sent Offers */}
        {!testMode && profile && (
          <SentOffersList tutorId={profile.id} />
        )}

        {/* Subjects Taught */}
        <div className="bg-white border-2 border-indigo-200 shadow-xl rounded-2xl p-6 mb-6 hover:shadow-indigo-300/50 transition-all duration-300">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Subjects You Teach</h2>
            <button
              onClick={() => setAddSubjectModalOpen(true)}
              className="bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white px-4 py-2 rounded-lg font-semibold shadow-lg hover:shadow-itutor-green/50 transition-all duration-300 hover:scale-105 flex items-center gap-2"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Subject
            </button>
          </div>
          {loadingData ? (
            <p className="text-gray-600">Loading subjects...</p>
          ) : tutorSubjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tutorSubjects.map((ts) => (
                <button
                  key={ts.id}
                  onClick={() => {
                    setSelectedSubject(ts);
                    setEditSubjectModalOpen(true);
                  }}
                  className="bg-gradient-to-br from-indigo-50 to-blue-50 border-2 border-indigo-200 rounded-xl p-5 hover:border-indigo-400 hover:shadow-lg transition-all duration-300 group text-left cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 group-hover:text-itutor-green transition-colors">{ts.subjects?.name || 'Unknown Subject'}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {ts.subjects?.curriculum} - {ts.subjects?.level}
                      </p>
                      <p className="text-xl font-bold bg-gradient-to-r from-itutor-green to-emerald-600 bg-clip-text text-transparent mt-3">
                        TT${paidClassesEnabled ? ts.price_per_hour_ttd : 0}/hour
                      </p>
                    </div>
                    <svg className="h-5 w-5 text-gray-500 group-hover:text-itutor-green transition-colors flex-shrink-0 ml-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">No subjects added yet</p>
              <button
                onClick={() => setAddSubjectModalOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-lg font-semibold shadow-lg hover:shadow-itutor-green/50 transition-all duration-300 hover:scale-105"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Your First Subject
              </button>
            </div>
          )}
        </div>

        {/* Upcoming Sessions */}
        <div className="bg-white border-2 border-pink-200 shadow-xl rounded-2xl p-6 mb-6 hover:shadow-pink-300/50 transition-all duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Upcoming Sessions</h2>
            <Link 
              href="/tutor/sessions"
              className="text-sm text-itutor-green hover:text-emerald-600 font-medium flex items-center gap-1 transition-colors"
            >
              View all →
            </Link>
          </div>
          {loadingData ? (
            <p className="text-gray-600">Loading sessions...</p>
          ) : sessions.length > 0 ? (
            <div className="space-y-3">
              {sessions.map((session) => {
                const sessionDate = new Date(session.scheduled_start_at);
                const now = new Date();
                const isPast = sessionDate < now;
                
                const sessionStatus = session.status?.toUpperCase();
                
                let displayStatus = 'Upcoming';
                let statusColor = 'bg-gradient-to-r from-blue-500 to-blue-600 text-white';
                
                if (sessionStatus === 'CANCELLED') {
                  displayStatus = 'Cancelled';
                  statusColor = 'bg-gradient-to-r from-red-500 to-red-600 text-white';
                } else if (sessionStatus === 'COMPLETED' || sessionStatus === 'COMPLETED_ASSUMED') {
                  displayStatus = 'Completed';
                  statusColor = 'bg-gradient-to-r from-green-500 to-emerald-600 text-white';
                } else if (sessionStatus === 'IN_PROGRESS' || sessionStatus === 'JOIN_OPEN') {
                  displayStatus = 'In Progress';
                  statusColor = 'bg-gradient-to-r from-purple-500 to-purple-600 text-white';
                } else if (sessionStatus === 'NO_SHOW_STUDENT') {
                  displayStatus = 'No Show';
                  statusColor = 'bg-gradient-to-r from-orange-500 to-orange-600 text-white';
                } else if (isPast && (sessionStatus === 'SCHEDULED' || sessionStatus === 'BOOKED')) {
                  displayStatus = 'Past';
                  statusColor = 'bg-gradient-to-r from-gray-500 to-gray-600 text-white';
                }
                
                return (
                  <div key={session.id} className="bg-gradient-to-br from-pink-50 to-purple-50 border-2 border-pink-200 rounded-xl p-4 hover:border-pink-400 hover:shadow-lg transition-all duration-200">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-bold text-gray-900 text-lg">{session.subject_name}</h3>
                          <span className={`px-3 py-1 text-xs font-semibold rounded-full shadow-lg ${statusColor}`}>
                            {displayStatus}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 font-medium mb-2">
                          with <span className="text-itutor-green font-semibold">{session.student_name}</span>
                        </p>
                        <p className="font-semibold text-gray-900">
                          {new Date(session.scheduled_start_at).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          {new Date(session.scheduled_start_at).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit'
                          })} • {session.duration_minutes} minutes
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="bg-pink-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <svg className="h-8 w-8 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-gray-600">No sessions yet</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link href="/tutor/availability">
            <div className="bg-white border-2 border-purple-200 shadow-lg rounded-2xl p-6 hover:shadow-purple-300/50 hover:scale-105 hover:-translate-y-1 transition-all duration-300 cursor-pointer group">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-purple-500 rounded-xl p-3 group-hover:scale-110 transition-transform">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 group-hover:text-purple-600 transition-colors">Availability</h3>
              </div>
              <p className="text-gray-600 group-hover:text-gray-700 transition-colors">Set your available hours</p>
            </div>
          </Link>
          <Link href="/tutor/sessions">
            <div className="bg-white border-2 border-blue-200 shadow-lg rounded-2xl p-6 hover:shadow-blue-300/50 hover:scale-105 hover:-translate-y-1 transition-all duration-300 cursor-pointer group">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-blue-500 rounded-xl p-3 group-hover:scale-110 transition-transform">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">Sessions</h3>
              </div>
              <p className="text-gray-600 group-hover:text-gray-700 transition-colors">View and manage sessions</p>
            </div>
          </Link>
          <Link href="/tutor/curriculum">
            <div className="bg-white border-2 border-orange-200 shadow-lg rounded-2xl p-6 hover:shadow-orange-300/50 hover:scale-105 hover:-translate-y-1 transition-all duration-300 cursor-pointer group">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-orange-500 rounded-xl p-3 group-hover:scale-110 transition-transform">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 group-hover:text-orange-600 transition-colors">Curriculum</h3>
              </div>
              <p className="text-gray-600 group-hover:text-gray-700 transition-colors">Browse CSEC subjects</p>
            </div>
          </Link>
          <Link href="/tutor/verification">
            <div className="bg-white border-2 border-green-200 shadow-lg rounded-2xl p-6 hover:shadow-green-300/50 hover:scale-105 hover:-translate-y-1 transition-all duration-300 cursor-pointer group">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-itutor-green rounded-xl p-3 group-hover:scale-110 transition-transform">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 group-hover:text-green-600 transition-colors">Verification</h3>
              </div>
              <p className="text-gray-600 group-hover:text-gray-700 transition-colors">Upload certificates</p>
            </div>
          </Link>
        </div>
      </div>

      {profile?.id ? (
        <TutorReviewsModal
          tutorId={profile.id}
          isOpen={reviewsModalOpen}
          onClose={() => setReviewsModalOpen(false)}
        />
      ) : null}
    </DashboardLayout>
  );
}
