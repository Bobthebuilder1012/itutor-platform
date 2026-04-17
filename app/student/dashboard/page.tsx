'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AvatarUploadModal from '@/components/AvatarUploadModal';
import EditSubjectsModal from '@/components/student/EditSubjectsModal';
import EditProfileModal from '@/components/EditProfileModal';
import WelcomeHeader from '@/components/student/WelcomeHeader';
import NextStepCard from '@/components/student/NextStepCard';
import UpcomingSessionsCard from '@/components/student/UpcomingSessionsCard';
import OffersCard from '@/components/student/OffersCard';
import ProfileSnapshotCard from '@/components/student/ProfileSnapshotCard';
import LearningJourneyCard from '@/components/student/LearningJourneyCard';
import StatsRow from '@/components/student/StatsRow';
import type { SessionAttendanceState } from '@/components/student/StudentSessionAttendance';
import { useAvatarUpload } from '@/lib/hooks/useAvatarUpload';
import { Session } from '@/lib/types/database';
import { Area } from '@/lib/utils/imageCrop';
import { getDisplayName } from '@/lib/utils/displayName';

type RecentTutor = {
  tutorId: string;
  name: string;
  avatarUrl: string | null;
  subjectLabel: string;
};

type EnrichedSession = Session & {
  tutor?: {
    id: string;
    full_name?: string;
    display_name?: string;
    username?: string;
  } | null;
  subject?: {
    id: string;
    label?: string;
    name?: string;
  } | null;
};

export default function StudentDashboard() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const testMode = searchParams.get('test') === 'true';
  const [upcomingSessions, setUpcomingSessions] = useState<EnrichedSession[]>([]);
  const [attendanceBySessionId, setAttendanceBySessionId] = useState<Record<string, SessionAttendanceState>>({});
  const [completedSessionsCount, setCompletedSessionsCount] = useState(0);
  const [totalHoursTutored, setTotalHoursTutored] = useState(0);
  const [loadingData, setLoadingData] = useState(true);
  const [recentTutors, setRecentTutors] = useState<RecentTutor[]>([]);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [editSubjectsModalOpen, setEditSubjectsModalOpen] = useState(false);
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const { uploadAvatar, uploading } = useAvatarUpload(profile?.id || '');

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
    if (!loading && profile && profile.role !== 'student') {
      router.push('/login');
      return;
    }

    // Only proceed with onboarding check if we have a valid profile
    if (!profile || profile.role !== 'student') {
      return;
    }

    // Skip onboarding check for child accounts created by parents
    if (profile.billing_mode !== 'parent_required') {
      // Check if onboarding is complete for regular students
      const isProfileComplete =
        Boolean(profile.form_level) &&
        Boolean(profile.subjects_of_study && profile.subjects_of_study.length > 0);

      if (!isProfileComplete) {
        router.push('/onboarding/student');
        return;
      }
    }

    fetchStudentData();
  }, [profile, loading, router, testMode]);

  // Scroll to hash anchor on page load (e.g., #lesson-offers)
  useEffect(() => {
    // Only run when loading is complete and we have data
    if (loadingData || !profile) return;

    const hash = window.location.hash;
    if (hash) {
      const elementId = hash.replace('#', '');
      
      // Retry function to handle cases where element isn't ready yet
      const scrollToElement = (attempt = 0) => {
        const element = document.getElementById(elementId);
        
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Add a highlight effect
          element.classList.add('ring-4', 'ring-itutor-green', 'ring-opacity-50');
          setTimeout(() => {
            element.classList.remove('ring-4', 'ring-itutor-green', 'ring-opacity-50');
          }, 2000);
        } else if (attempt < 5) {
          // Retry up to 5 times with increasing delays
          setTimeout(() => scrollToElement(attempt + 1), 200 * (attempt + 1));
        }
      };

      // Start scrolling after a brief delay to ensure rendering
      const timeoutId = setTimeout(() => scrollToElement(), 300);
      return () => clearTimeout(timeoutId);
    }
  }, [loadingData, profile]); // Run after data is loaded and profile exists

  async function fetchStudentData() {
    if (!profile) return;

    try {
      const [upcomingRes, completedRes] = await Promise.all([
        supabase
          .from('sessions')
          .select('*')
          .eq('student_id', profile.id)
          .in('status', ['SCHEDULED', 'JOIN_OPEN'])
          .gte('scheduled_start_at', new Date().toISOString())
          .order('scheduled_start_at', { ascending: true })
          .limit(5),
        supabase
          .from('sessions')
          .select('*')
          .eq('student_id', profile.id)
          .eq('status', 'COMPLETED_ASSUMED')
      ]);

      // Enrich upcoming sessions with tutor and subject details
      if (upcomingRes.data && upcomingRes.data.length > 0) {
        const tutorIds = [...new Set(upcomingRes.data.map(s => s.tutor_id).filter(Boolean))];
        const subjectIds = [...new Set(upcomingRes.data.map(s => s.subject_id).filter(Boolean))];

        const [tutorsData, subjectsData] = await Promise.all([
          tutorIds.length > 0 
            ? supabase.from('profiles').select('id, full_name, display_name, username').in('id', tutorIds)
            : Promise.resolve({ data: [], error: null }),
          subjectIds.length > 0
            ? supabase.from('subjects').select('id, label, name').in('id', subjectIds)
            : Promise.resolve({ data: [], error: null })
        ]);

        const enrichedSessions = upcomingRes.data.map(session => ({
          ...session,
          tutor: tutorsData.data?.find(t => t.id === session.tutor_id) || null,
          subject: subjectsData.data?.find(s => s.id === session.subject_id) || null
        }));

        setUpcomingSessions(enrichedSessions);

        const sessionIds = enrichedSessions.map((s) => s.id);
        if (sessionIds.length > 0) {
          const { data: attRows } = await supabase
            .from('session_student_attendance')
            .select('session_id, status, updated_at')
            .in('session_id', sessionIds);
          const next: Record<string, SessionAttendanceState> = {};
          for (const r of attRows ?? []) {
            const row = r as { session_id: string; status: 'attending' | 'not_attending'; updated_at: string };
            next[row.session_id] = { status: row.status, updatedAt: row.updated_at };
          }
          setAttendanceBySessionId(next);
        } else {
          setAttendanceBySessionId({});
        }
      } else {
        setUpcomingSessions([]);
        setAttendanceBySessionId({});
      }
      
      if (completedRes.data) {
        setCompletedSessionsCount(completedRes.data.length);
        
        const totalMinutes = completedRes.data.reduce((acc, session) => {
          return acc + (session.duration_minutes || 0);
        }, 0);
        setTotalHoursTutored(Math.round((totalMinutes / 60) * 10) / 10);
      }

      const { data: bookingRows } = await supabase
        .from('bookings')
        .select('tutor_id, subject_id, updated_at')
        .eq('student_id', profile.id)
        .order('updated_at', { ascending: false })
        .limit(40);

      const orderedTutorIds: string[] = [];
      const tutorSubject = new Map<string, string>();
      const seenTutors = new Set<string>();
      for (const row of bookingRows ?? []) {
        const tid = row.tutor_id as string;
        if (!tid || seenTutors.has(tid)) continue;
        seenTutors.add(tid);
        orderedTutorIds.push(tid);
        tutorSubject.set(tid, row.subject_id as string);
        if (orderedTutorIds.length >= 8) break;
      }

      if (orderedTutorIds.length > 0) {
        const subjectIds = [...new Set([...tutorSubject.values()].filter(Boolean))];
        const [{ data: tutorProfiles }, { data: subjectRows }] = await Promise.all([
          supabase.from('profiles').select('id, full_name, display_name, username, avatar_url').in('id', orderedTutorIds),
          subjectIds.length
            ? supabase.from('subjects').select('id, name, label').in('id', subjectIds)
            : Promise.resolve({ data: [] as { id: string; name: string; label: string | null }[], error: null }),
        ]);
        const subMap = new Map((subjectRows ?? []).map((s) => [s.id, s.label || s.name]));
        const profMap = new Map((tutorProfiles ?? []).map((p) => [p.id, p]));
        const recents: RecentTutor[] = orderedTutorIds.map((tid) => {
          const p = profMap.get(tid);
          const sid = tutorSubject.get(tid);
          return {
            tutorId: tid,
            name: p ? getDisplayName(p) : 'Tutor',
            avatarUrl: p?.avatar_url ?? null,
            subjectLabel: sid ? subMap.get(sid) || 'Subject' : 'Subject',
          };
        });
        setRecentTutors(recents.slice(0, 6));
      } else {
        setRecentTutors([]);
      }
    } catch (error) {
      console.error('Error fetching student data:', error);
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

  const displayName = testMode ? 'Test Student' : (profile ? getDisplayName(profile) : 'Student');
  const greetingName = profile?.display_name || profile?.full_name?.split(' ')[0] || null;

  const handleAvatarUpload = async (imageSrc: string, croppedArea: Area) => {
    if (!profile) return;
    
    const result = await uploadAvatar(imageSrc, croppedArea);
    if (result.success) {
      window.location.reload();
    }
  };

  return (
    <DashboardLayout role="student" userName={displayName}>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Test Mode Banner */}
        {testMode && (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-xl">
            <div className="flex">
              <svg className="h-5 w-5 text-amber-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="ml-3 text-sm text-amber-700">
                <strong>Test Mode:</strong> You&apos;re viewing the dashboard UI only. Real data requires authentication.
              </p>
            </div>
          </div>
        )}

        {!testMode && profile && (
          <>
            {/* Greeting */}
            <WelcomeHeader displayName={greetingName} />

            {/* Stats row — 3 cols */}
            <StatsRow
              completedSessions={completedSessionsCount}
              totalHours={totalHoursTutored}
              loading={loadingData}
              subjectsCount={profile.subjects_of_study?.length || 0}
            />

            {!loadingData && recentTutors.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Recent tutors</h2>
                  <span className="text-xs text-gray-500">From your bookings</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {recentTutors.map((t) => (
                    <button
                      key={t.tutorId}
                      type="button"
                      onClick={() => router.push(`/student/tutors/${t.tutorId}`)}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:border-itutor-green hover:bg-emerald-50/40 transition"
                    >
                      {t.avatarUrl ? (
                        <img src={t.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{t.name}</p>
                        <p className="text-xs text-gray-500 truncate">{t.subjectLabel}</p>
                        <p className="text-xs text-itutor-green font-medium mt-1">Book again →</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Profile + Next Step — 2 cols */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ProfileSnapshotCard
                profile={profile}
                onEditProfile={() => setEditProfileModalOpen(true)}
                onEditSubjects={() => setEditSubjectsModalOpen(true)}
                onChangeAvatar={() => setAvatarModalOpen(true)}
              />
              <NextStepCard
                upcomingSessions={upcomingSessions}
                subjects={profile.subjects_of_study}
                onFindTutor={() => router.push('/student/find-tutors')}
                onAddSubjects={() => setEditSubjectsModalOpen(true)}
              />
            </div>

            {/* Sessions + Offers — 2 cols */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <UpcomingSessionsCard
                sessions={upcomingSessions}
                loading={loadingData}
                onViewSession={() => router.push('/student/bookings')}
                attendanceBySessionId={attendanceBySessionId}
                onAttendanceRefresh={() => void fetchStudentData()}
              />
              <OffersCard studentId={profile.id} />
            </div>

          </>
        )}
      </div>

      {/* Modals */}
      <AvatarUploadModal
        isOpen={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        onUpload={handleAvatarUpload}
        uploading={uploading}
      />

      {!testMode && profile && (
        <>
          <EditSubjectsModal
            isOpen={editSubjectsModalOpen}
            onClose={() => setEditSubjectsModalOpen(false)}
            currentSubjects={profile.subjects_of_study || []}
            userId={profile.id}
            onSuccess={() => window.location.reload()}
          />

          <EditProfileModal
            isOpen={editProfileModalOpen}
            onClose={() => setEditProfileModalOpen(false)}
            profile={profile}
            onSuccess={() => window.location.reload()}
          />
        </>
      )}
    </DashboardLayout>
  );
}
