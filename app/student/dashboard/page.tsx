'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AvatarUploadModal from '@/components/AvatarUploadModal';
import EditSubjectsModal from '@/components/student/EditSubjectsModal';
import EditProfileModal from '@/components/EditProfileModal';
import UniversalSearchBar from '@/components/UniversalSearchBar';
import WelcomeHeader from '@/components/student/WelcomeHeader';
import NextStepCard from '@/components/student/NextStepCard';
import UpcomingSessionsCard from '@/components/student/UpcomingSessionsCard';
import OffersCard from '@/components/student/OffersCard';
import ProfileSnapshotCard from '@/components/student/ProfileSnapshotCard';
import LearningJourneyCard from '@/components/student/LearningJourneyCard';
import StatsRow from '@/components/student/StatsRow';
import { useAvatarUpload } from '@/lib/hooks/useAvatarUpload';
import { Session } from '@/lib/types/database';
import { Area } from '@/lib/utils/imageCrop';
import { getDisplayName } from '@/lib/utils/displayName';

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
  const [completedSessionsCount, setCompletedSessionsCount] = useState(0);
  const [totalHoursTutored, setTotalHoursTutored] = useState(0);
  const [loadingData, setLoadingData] = useState(true);
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
        profile.school && 
        profile.form_level && 
        profile.subjects_of_study && 
        profile.subjects_of_study.length > 0;

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
      } else {
        setUpcomingSessions([]);
      }
      
      if (completedRes.data) {
        setCompletedSessionsCount(completedRes.data.length);
        
        const totalMinutes = completedRes.data.reduce((acc, session) => {
          return acc + (session.duration_minutes || 0);
        }, 0);
        setTotalHoursTutored(Math.round((totalMinutes / 60) * 10) / 10);
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
      {/* Universal Search Bar */}
      {!testMode && profile && (
        <div className="px-4 sm:px-6 lg:px-8 pt-1 pb-2 bg-gradient-to-br from-gray-50 to-white">
          <UniversalSearchBar
            userRole="student"
            onResultClick={(tutor) => {
              router.push(`/student/tutors/${tutor.id}`);
            }}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="px-4 pt-2 pb-6 sm:px-6 lg:px-8 space-y-6 max-w-6xl mx-auto">
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

        {!testMode && profile && (
          <>
            {/* Welcome Header */}
            <WelcomeHeader displayName={greetingName} />

            {/* Profile Snapshot - Moved to top */}
            <ProfileSnapshotCard
              profile={profile}
              onEditProfile={() => setEditProfileModalOpen(true)}
              onEditSubjects={() => setEditSubjectsModalOpen(true)}
              onChangeAvatar={() => setAvatarModalOpen(true)}
            />

            {/* Next Step Card */}
            <NextStepCard
              upcomingSessions={upcomingSessions}
              subjects={profile.subjects_of_study}
              onFindTutor={() => router.push('/student/find-tutors')}
              onAddSubjects={() => setEditSubjectsModalOpen(true)}
            />

            {/* Upcoming Sessions */}
            <UpcomingSessionsCard
              sessions={upcomingSessions}
              loading={loadingData}
              onViewSession={(sessionId) => router.push(`/student/sessions`)}
            />

            {/* Offers Received */}
            <OffersCard studentId={profile.id} />

            {/* Learning Journey */}
            <LearningJourneyCard
              completedSessions={completedSessionsCount}
              totalHours={totalHoursTutored}
              subjects={profile.subjects_of_study?.length || 0}
            />

            {/* Stats Row */}
            <StatsRow
              completedSessions={completedSessionsCount}
              totalHours={totalHoursTutored}
              loading={loadingData}
            />
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
