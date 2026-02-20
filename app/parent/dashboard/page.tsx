'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import ProfileHeader from '@/components/ProfileHeader';
import AvatarUploadModal from '@/components/AvatarUploadModal';
import EditProfileModal from '@/components/EditProfileModal';
import UniversalSearchBar from '@/components/UniversalSearchBar';
import { useAvatarUpload } from '@/lib/hooks/useAvatarUpload';
import { Profile, ParentChildLink } from '@/lib/types/database';
import { Area } from '@/lib/utils/imageCrop';
import { getDisplayName } from '@/lib/utils/displayName';
import ChildProfileOverview from '@/components/parent/ChildProfileOverview';
import UpcomingSessions from '@/components/parent/UpcomingSessions';
import TutorFeedback from '@/components/parent/TutorFeedback';
import AcademicFocusAreas from '@/components/parent/AcademicFocusAreas';
import AttendanceSummary from '@/components/parent/AttendanceSummary';
import LessonHistory from '@/components/parent/LessonHistory';
import ProgressIndicator from '@/components/parent/ProgressIndicator';
import PaymentsBilling from '@/components/parent/PaymentsBilling';
import SupportHelp from '@/components/parent/SupportHelp';
import ChildrenUpcomingSessions from '@/components/parent/ChildrenUpcomingSessions';
import ChildrenBookings from '@/components/parent/ChildrenBookings';
import ChildrenTutorFeedback from '@/components/parent/ChildrenTutorFeedback';

type ChildWithProfile = ParentChildLink & {
  child_profile?: Profile;
};

export default function ParentDashboard() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const testMode = searchParams.get('test') === 'true';
  const [children, setChildren] = useState<ChildWithProfile[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
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
    if (!loading && profile && profile.role !== 'parent') {
      router.push('/login');
      return;
    }

    // Only fetch children if we have a valid profile
    if (profile && profile.role === 'parent') {
      fetchChildren();
    }
  }, [profile, loading, router, testMode]);

  async function fetchChildren() {
    if (!profile) return;

    try {
      const { data } = await supabase
        .from('parent_child_links')
        .select(`
          *,
          child_profile:profiles!parent_child_links_child_id_fkey(*)
        `)
        .eq('parent_id', profile.id);

      if (data) setChildren(data as ChildWithProfile[]);
    } catch (error) {
      console.error('Error fetching children:', error);
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

  const displayName = testMode ? 'Test Parent' : (profile ? getDisplayName(profile) : 'Parent');

  const handleAvatarUpload = async (imageSrc: string, croppedArea: Area) => {
    if (!profile) return;
    
    const result = await uploadAvatar(imageSrc, croppedArea);
    if (result.success) {
      // Refresh the page to show new avatar
      window.location.reload();
    }
  };

  return (
    <DashboardLayout role="parent" userName={displayName}>
      {/* Universal Search Bar - Full Width, Right Under Header */}
      {!testMode && profile && (
        <div className="px-4 sm:px-6 lg:px-8 pt-2 pb-1 bg-gradient-to-br from-gray-50 to-white">
          <UniversalSearchBar
            userRole="parent"
            onResultClick={(tutor) => {
              router.push(`/parent/tutors/${tutor.id}`);
            }}
          />
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
          role="parent"
          country={testMode ? 'Trinidad & Tobago' : profile?.country}
          subjectsLine={children.length > 0 ? `Managing ${children.length} ${children.length === 1 ? 'child' : 'children'}` : null}
          bio={profile?.bio}
          avatarUrl={profile?.avatar_url}
          onAvatarClick={() => setAvatarModalOpen(true)}
          userId={profile?.id}
        />

        {/* Avatar Upload Modal */}
        <AvatarUploadModal
          isOpen={avatarModalOpen}
          onClose={() => setAvatarModalOpen(false)}
          onUpload={handleAvatarUpload}
          uploading={uploading}
        />

        {/* Mock Data for Testing */}
        {testMode && (
          <>
            {/* 1. Child Profile Overview */}
            <ChildProfileOverview
              childName="Sarah Johnson"
              school="Queen's Royal College"
              formLevel="Form 5"
              subjects={['CSEC Mathematics', 'CSEC Chemistry', 'CAPE Physics']}
              tutors={['Dr. James Mitchell', 'Ms. Alicia Roberts']}
            />

            {/* 2. Upcoming Sessions */}
            <UpcomingSessions
              sessions={[
                {
                  id: '1',
                  date: 'Monday, Dec 28',
                  time: '2:00 PM',
                  subject: 'CSEC Mathematics',
                  tutorName: 'Dr. James Mitchell',
                  sessionType: 'online',
                },
                {
                  id: '2',
                  date: 'Wednesday, Dec 30',
                  time: '4:00 PM',
                  subject: 'CSEC Chemistry',
                  tutorName: 'Ms. Alicia Roberts',
                  sessionType: 'online',
                },
                {
                  id: '3',
                  date: 'Friday, Jan 1',
                  time: '10:00 AM',
                  subject: 'CAPE Physics',
                  tutorName: 'Dr. James Mitchell',
                  sessionType: 'online',
                },
              ]}
            />

            {/* 3. Recent Tutor Feedback */}
            <TutorFeedback
              feedback={[
                {
                  id: '1',
                  date: 'December 20, 2025',
                  subject: 'CSEC Mathematics',
                  topicCovered: 'Quadratic Equations and Factorization',
                  effortLevel: 'High',
                  understandingLevel: 'Strong',
                  comment: 'Sarah showed excellent understanding of factorization methods. She completed all practice problems accurately and asked insightful questions.',
                },
                {
                  id: '2',
                  date: 'December 18, 2025',
                  subject: 'CSEC Chemistry',
                  topicCovered: 'Chemical Bonding and Lewis Structures',
                  effortLevel: 'Medium',
                  understandingLevel: 'Improving',
                  comment: 'Good progress on ionic and covalent bonding. Recommend additional practice on drawing Lewis structures for complex molecules.',
                },
                {
                  id: '3',
                  date: 'December 15, 2025',
                  subject: 'CAPE Physics',
                  topicCovered: 'Newton\'s Laws of Motion',
                  effortLevel: 'High',
                  understandingLevel: 'Strong',
                  comment: 'Excellent grasp of fundamental concepts. Sarah successfully solved challenging problems involving multiple forces and acceleration.',
                },
              ]}
            />

            {/* 4. Academic Focus Areas */}
            <AcademicFocusAreas
              focusArea={{
                strugglingWith: [
                  'Organic Chemistry nomenclature and reactions',
                  'Complex word problems in Mathematics',
                ],
                workingOn: [
                  'Improving time management during practice exams',
                  'Strengthening understanding of projectile motion in Physics',
                  'Developing effective note-taking strategies',
                ],
                confidentIn: [
                  'Algebra and algebraic manipulation',
                  'Basic atomic structure and periodic table trends',
                  'Kinematics and linear motion problems',
                ],
              }}
            />

            {/* 5. Attendance Summary */}
            <AttendanceSummary
              totalBooked={24}
              attended={22}
              missed={1}
              tutorCancellations={1}
            />

            {/* 6. Lesson History */}
            <LessonHistory
              lessons={[
                {
                  id: '1',
                  date: 'Dec 20, 2025',
                  subject: 'CSEC Mathematics',
                  tutor: 'Dr. James Mitchell',
                  duration: '60 min',
                  status: 'Completed',
                },
                {
                  id: '2',
                  date: 'Dec 18, 2025',
                  subject: 'CSEC Chemistry',
                  tutor: 'Ms. Alicia Roberts',
                  duration: '60 min',
                  status: 'Completed',
                },
                {
                  id: '3',
                  date: 'Dec 15, 2025',
                  subject: 'CAPE Physics',
                  tutor: 'Dr. James Mitchell',
                  duration: '90 min',
                  status: 'Completed',
                },
                {
                  id: '4',
                  date: 'Dec 13, 2025',
                  subject: 'CSEC Mathematics',
                  tutor: 'Dr. James Mitchell',
                  duration: '60 min',
                  status: 'Completed',
                },
                {
                  id: '5',
                  date: 'Dec 11, 2025',
                  subject: 'CSEC Chemistry',
                  tutor: 'Ms. Alicia Roberts',
                  duration: '60 min',
                  status: 'Missed',
                },
                {
                  id: '6',
                  date: 'Dec 8, 2025',
                  subject: 'CAPE Physics',
                  tutor: 'Dr. James Mitchell',
                  duration: '60 min',
                  status: 'Cancelled',
                },
              ]}
            />

            {/* 7. Progress Indicator */}
            <ProgressIndicator
              progressData={[
                { subject: 'CSEC Mathematics', status: 'Improving' },
                { subject: 'CSEC Chemistry', status: 'Stable' },
                { subject: 'CAPE Physics', status: 'Improving' },
              ]}
            />

            {/* 8. Payments & Billing */}
            <PaymentsBilling
              sessionsPaid={30}
              sessionsUsed={22}
              remainingBalance="TTD $400.00"
              receipts={[
                {
                  id: '1',
                  date: 'December 1, 2025',
                  amount: 'TTD $1,500.00',
                  description: '30 Session Package - Mathematics & Science',
                },
                {
                  id: '2',
                  date: 'November 1, 2025',
                  amount: 'TTD $1,200.00',
                  description: '20 Session Package - Mathematics',
                },
              ]}
            />

            {/* 9. Support & Help */}
            <SupportHelp />
          </>
        )}

        {/* Edit Profile Modal */}
        {!testMode && profile && (
          <EditProfileModal
            isOpen={editProfileModalOpen}
            onClose={() => setEditProfileModalOpen(false)}
            profile={profile}
            onSuccess={() => window.location.reload()}
          />
        )}

        {/* Real Data View */}
        {!testMode && (
          <>
            {/* Action Buttons */}
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={() => setEditProfileModalOpen(true)}
                className="px-4 py-2 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-black rounded-lg font-semibold transition flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Edit Profile
              </button>
              <Link
                href="/parent/add-child"
                className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-6 py-3 rounded-lg font-semibold shadow-lg hover:shadow-purple-500/50 transition-all duration-300 hover:scale-105 flex items-center gap-2"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Child
              </Link>
            </div>

            {/* Children List */}
            <div className="bg-white border-2 border-purple-200 shadow-xl rounded-2xl p-6 hover:shadow-purple-300/50 transition-all duration-300">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Children</h2>
              
              {loadingData ? (
                <p className="text-gray-600">Loading children...</p>
              ) : children.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {children.map((link) => {
                    const child = link.child_profile;
                    if (!child) return null;

                    const childColor = link.child_color || '#9333EA';
                    
                    // Helper function to lighten color for background
                    const lightenColor = (hex: string, percent: number) => {
                      const num = parseInt(hex.replace('#', ''), 16);
                      const r = Math.min(255, ((num >> 16) & 0xff) + Math.floor((255 - ((num >> 16) & 0xff)) * percent));
                      const g = Math.min(255, ((num >> 8) & 0xff) + Math.floor((255 - ((num >> 8) & 0xff)) * percent));
                      const b = Math.min(255, (num & 0xff) + Math.floor((255 - (num & 0xff)) * percent));
                      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
                    };

                    const lightBg = lightenColor(childColor, 0.92);
                    const lighterBg = lightenColor(childColor, 0.95);
                    const borderColor = lightenColor(childColor, 0.70);
                    const hoverBorderColor = lightenColor(childColor, 0.50);
                    
                    return (
                      <div
                        key={link.id}
                        className="border-2 rounded-2xl p-5 hover:shadow-lg transition-all duration-300 group relative"
                        style={{
                          background: `linear-gradient(to bottom right, ${lightBg}, ${lighterBg})`,
                          borderColor: borderColor
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = hoverBorderColor}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = borderColor}
                      >
                        {/* Color Picker Circle */}
                        <div className="absolute top-3 right-3 group/color">
                          <input
                            type="color"
                            value={childColor}
                            onChange={async (e) => {
                              const newColor = e.target.value;
                              try {
                                const { error } = await supabase.rpc('update_child_color', {
                                  p_parent_id: profile!.id,
                                  p_child_id: child.id,
                                  p_color: newColor
                                });
                                if (!error) {
                                  // Refresh children list
                                  fetchChildren();
                                }
                              } catch (err) {
                                console.error('Error updating color:', err);
                              }
                            }}
                            className="w-8 h-8 rounded-full cursor-pointer border-2 border-white shadow-lg hover:scale-110 transition-transform"
                            title="Click to change color"
                          />
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                          <div 
                            className="rounded-full w-12 h-12 flex items-center justify-center text-white font-bold text-lg shadow-lg"
                            style={{ backgroundColor: childColor }}
                          >
                            {child.full_name.charAt(0)}
                          </div>
                          <h3 className="font-bold text-lg text-gray-900 pr-8">{child.full_name}</h3>
                        </div>
                        <div className="space-y-3 mb-4">
                          <div>
                            <p className="text-xs font-medium" style={{ color: childColor }}>School</p>
                            <p className="text-sm text-gray-700">{child.school || 'Not set'}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium" style={{ color: childColor }}>Form Level</p>
                            <p className="text-sm text-gray-700">{child.form_level || 'Not set'}</p>
                          </div>
                        </div>

                        <div className="flex flex-col space-y-2">
                          <Link
                            href={`/parent/child/${child.id}`}
                            className="text-center text-white px-3 py-2.5 rounded-lg text-sm font-semibold shadow-lg hover:scale-105 transition-all duration-200"
                            style={{ 
                              background: `linear-gradient(to right, ${childColor}, ${lightenColor(childColor, -0.1)})`,
                            }}
                            onMouseEnter={(e) => {
                              const darker = lightenColor(childColor, -0.15);
                              e.currentTarget.style.background = `linear-gradient(to right, ${darker}, ${lightenColor(darker, -0.05)})`;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = `linear-gradient(to right, ${childColor}, ${lightenColor(childColor, -0.1)})`;
                            }}
                          >
                            View Dashboard
                          </Link>
                          <Link
                            href={`/parent/child/${child.id}/sessions`}
                            className="text-center bg-white hover:bg-gray-50 border-2 px-3 py-2.5 rounded-lg text-sm font-medium hover:scale-105 transition-all duration-200"
                            style={{ 
                              borderColor: childColor,
                              color: childColor
                            }}
                          >
                            Sessions
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="bg-purple-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
                    <svg className="h-10 w-10 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">No children added yet</h3>
                  <p className="text-gray-600 mb-6">Add your children to manage their learning journey</p>
                  <Link
                    href="/parent/add-child"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-lg font-semibold shadow-lg hover:shadow-itutor-green/50 transition-all duration-300 hover:scale-105"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Your First Child
                  </Link>
                </div>
              )}
            </div>

            {/* Children's Upcoming Sessions */}
            {children.length > 0 && (
              <div className="mt-8 bg-white border-2 border-blue-200 shadow-xl rounded-2xl p-6 hover:shadow-blue-300/50 transition-all duration-300">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Upcoming Sessions
                </h2>
                <ChildrenUpcomingSessions childIds={children.map(c => c.child_id)} />
              </div>
            )}

            {/* Children's Bookings */}
            {children.length > 0 && (
              <div className="mt-8 bg-white border-2 border-green-200 shadow-xl rounded-2xl p-6 hover:shadow-green-300/50 transition-all duration-300">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Booking Requests
                </h2>
                <ChildrenBookings childIds={children.map(c => c.child_id)} />
              </div>
            )}

            {/* Tutor Feedback */}
            {children.length > 0 && (
              <div className="mt-8 bg-white border-2 border-amber-200 shadow-xl rounded-2xl p-6 hover:shadow-amber-300/50 transition-all duration-300">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  Recent Tutor Feedback
                </h2>
                <ChildrenTutorFeedback childIds={children.map(c => c.child_id)} />
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
