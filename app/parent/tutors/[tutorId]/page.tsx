'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import VerifiedBadge from '@/components/VerifiedBadge';
import TutorCalendarWidget from '@/components/booking/TutorCalendarWidget';
import BookingRequestModal from '@/components/booking/BookingRequestModal';
import VerifiedSubjectsButton from '@/components/tutor/VerifiedSubjectsButton';
import VerifiedSubjectsModal from '@/components/tutor/VerifiedSubjectsModal';
import RatingComment from '@/components/tutor/RatingComment';

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

type Child = {
  id: string;
  full_name: string;
  display_name: string | null;
};

export default function ParentTutorProfilePage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const tutorId = params.tutorId as string;
  
  const [tutor, setTutor] = useState<TutorProfile | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<TutorProfile['subjects'][0] | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{ start: string; end: string } | null>(null);
  const [verifiedSubjectsModalOpen, setVerifiedSubjectsModalOpen] = useState(false);
  const [verifiedSubjects, setVerifiedSubjects] = useState<any[]>([]);
  const [csecSubjects, setCsecSubjects] = useState<any[]>([]);
  const [capeSubjects, setCapeSubjects] = useState<any[]>([]);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'parent') {
      router.push('/login');
      return;
    }

    fetchChildren();
    fetchTutorProfile();
    fetchVerifiedSubjects();
  }, [profile, profileLoading, router, tutorId]);

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

  async function fetchChildren() {
    if (!profile) return;

    try {
      const { data, error } = await supabase
        .from('parent_child_links')
        .select('child_profile:profiles!parent_child_links_child_id_fkey(id, full_name, display_name)')
        .eq('parent_id', profile.id);

      if (error) throw error;

      const childrenList = (data || []).map((link: any) => link.child_profile).filter(Boolean);
      setChildren(childrenList);
      
      // Auto-select first child if available
      if (childrenList.length > 0 && !selectedChild) {
        setSelectedChild(childrenList[0]);
      }
    } catch (error) {
      console.error('Error fetching children:', error);
    }
  }

  async function fetchTutorProfile() {
    try {
      // Fetch tutor profile
      const { data: tutorData, error: tutorError} = await supabase
        .from('profiles')
        .select('id, full_name, username, display_name, avatar_url, school, institution_id, country, bio, tutor_verification_status')
        .eq('id', tutorId)
        .eq('role', 'tutor')
        .single();

      if (tutorError) throw tutorError;
      if (!tutorData) {
        alert('Tutor not found');
        router.push('/parent/dashboard');
        return;
      }

      // Fetch tutor subjects
      const { data: tutorSubjects, error: subjectsError } = await supabase
        .from('tutor_subjects')
        .select('subject_id, price_per_hour_ttd')
        .eq('tutor_id', tutorId);

      if (subjectsError) throw subjectsError;

      // Fetch subjects details
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
            price_per_hour_ttd: ts.price_per_hour_ttd
          } : null;
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      // Fetch ratings sorted by popularity
      const { data: ratingsData, error: ratingsError } = await supabase
        .from('ratings')
        .select('id, stars, comment, created_at, student_id, helpful_count')
        .eq('tutor_id', tutorId)
        .not('comment', 'is', null)
        .order('helpful_count', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (ratingsError) {
        console.error('❌ Error fetching ratings:', ratingsError);
      }

      // Fetch student names for ratings
      let ratings: Array<{
        id: string;
        stars: number;
        comment: string | null;
        created_at: string;
        student_name: string;
        helpful_count: number;
      }> = [];
      
      let avgRating = null;

      if (ratingsData && ratingsData.length > 0) {
        const studentIds = ratingsData.map(r => r.student_id);
        const { data: students, error: studentsError } = await supabase
          .from('profiles')
          .select('id, full_name, username, display_name')
          .in('id', studentIds);

        if (studentsError) {
          console.error('❌ Error fetching student names:', studentsError);
        }

        const studentsMap = new Map(students?.map(s => [s.id, s]) || []);

        ratings = ratingsData.map(r => {
          const student = studentsMap.get(r.student_id);
          return {
            id: r.id,
            stars: r.stars,
            comment: r.comment,
            created_at: r.created_at,
            student_name: student ? getDisplayName(student) : 'Anonymous',
            helpful_count: r.helpful_count || 0
          };
        });

        avgRating = ratingsData.reduce((sum, r) => sum + r.stars, 0) / ratingsData.length;
      }

      setTutor({
        ...tutorData,
        subjects,
        average_rating: avgRating,
        total_reviews: ratings.length,
        ratings
      });
    } catch (error) {
      console.error('Error fetching tutor profile:', error);
      alert('Failed to load tutor profile');
    } finally {
      setLoading(false);
    }
  }

  const handleSlotSelect = (startAt: string, endAt: string) => {
    if (!selectedChild) {
      alert('Please select a child to book for');
      return;
    }
    setSelectedTimeSlot({ start: startAt, end: endAt });
    setBookingModalOpen(true);
  };

  const handleBookingSuccess = (bookingId: string) => {
    alert(`Booking request sent successfully for ${selectedChild?.full_name || selectedChild?.display_name}! The tutor will respond soon.`);
    setBookingModalOpen(false);
    setSelectedTimeSlot(null);
    // Navigate to child's bookings page
    router.push(`/parent/child/${selectedChild?.id}/bookings`);
  };

  const handleSubjectClick = (subject: TutorProfile['subjects'][0]) => {
    setSelectedSubject(subject);
    setSelectedTimeSlot(null);
  };

  if (profileLoading || loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!tutor) {
    return (
      <DashboardLayout role="parent" userName={getDisplayName(profile)}>
        <div className="text-center py-12">
          <p className="text-gray-600">Tutor not found</p>
        </div>
      </DashboardLayout>
    );
  }

  if (children.length === 0) {
    return (
      <DashboardLayout role="parent" userName={getDisplayName(profile)}>
        <div className="max-w-4xl mx-auto text-center py-12">
          <div className="bg-purple-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
            <svg className="h-10 w-10 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Add a child first</h3>
          <p className="text-gray-600 mb-6">You need to add at least one child before booking tutors</p>
          <button
            onClick={() => router.push('/parent/add-child')}
            className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-6 py-3 rounded-lg font-semibold shadow-lg hover:scale-105 transition-all"
          >
            Add Child
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="parent" userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-0 max-w-6xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="mb-6 text-purple-600 hover:text-purple-700 flex items-center gap-2 transition-colors font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Search
        </button>

        {/* Child Selector */}
        {children.length > 1 && (
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 shadow-lg rounded-2xl p-5 mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-3">Booking for:</label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {children.map(child => (
                <button
                  key={child.id}
                  onClick={() => setSelectedChild(child)}
                  className={`
                    px-4 py-3 rounded-xl font-semibold transition-all border-2
                    ${selectedChild?.id === child.id
                      ? 'bg-purple-600 text-white border-purple-600 shadow-lg scale-105'
                      : 'bg-white text-gray-700 border-purple-200 hover:border-purple-400 hover:scale-102'
                    }
                  `}
                >
                  {child.display_name || child.full_name}
                </button>
              ))}
            </div>
          </div>
        )}

        {children.length === 1 && (
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 shadow-lg rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 text-purple-700 font-semibold">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Booking for: {selectedChild?.display_name || selectedChild?.full_name}
            </div>
          </div>
        )}

        {/* Tutor Header */}
        <div className="bg-white border-2 border-indigo-200 shadow-xl rounded-2xl p-8 mb-6 hover:shadow-indigo-300/50 transition-all duration-300">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Avatar */}
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center text-white font-bold text-4xl flex-shrink-0 shadow-lg">
              {tutor.avatar_url ? (
                <img src={tutor.avatar_url} alt={getDisplayName(tutor)} className="w-full h-full rounded-full object-cover" />
              ) : (
                getDisplayName(tutor).charAt(0).toUpperCase()
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                {getDisplayName(tutor)}
                {tutor.tutor_verification_status === 'VERIFIED' && <VerifiedBadge size="lg" />}
              </h1>
              {tutor.username && (
                <p className="text-gray-600 mb-2">@{tutor.username}</p>
              )}
              
              <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
                {tutor.school && (
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    {tutor.school}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {tutor.country}
                </span>
              </div>

              {tutor.average_rating !== null && (
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex text-2xl">
                    {[1, 2, 3, 4, 5].map(star => (
                      <span
                        key={star}
                        className={star <= Math.round(tutor.average_rating!) ? 'text-yellow-400' : 'text-gray-300'}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="text-lg font-semibold text-gray-900">
                    {tutor.average_rating.toFixed(1)}
                  </span>
                  <span className="text-sm text-gray-600">
                    ({tutor.total_reviews} {tutor.total_reviews === 1 ? 'review' : 'reviews'})
                  </span>
                </div>
              )}

              {/* Biography */}
              {tutor.bio && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-start gap-2">
                    <svg className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {tutor.bio}
                    </p>
                  </div>
                </div>
              )}

              {/* Verified Subjects Button */}
              {tutor.tutor_verification_status === 'VERIFIED' && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <VerifiedSubjectsButton 
                    onClick={() => setVerifiedSubjectsModalOpen(true)}
                    variant="secondary"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Booking Calendar */}
          <div className="lg:col-span-2">
            {/* Verified CXC Results Section */}
            {tutor.tutor_verification_status === 'VERIFIED' && verifiedSubjects.length > 0 && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 shadow-xl rounded-2xl p-6 mb-6 hover:shadow-green-300/50 transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">Verified CXC Results</h2>
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                    Results verified by iTutor. CXC is a trademark of the Caribbean Examinations Council.
                  </p>
                </div>
              </div>
            )}

            {/* Subjects Overview */}
            <div className="bg-white border-2 border-blue-200 shadow-xl rounded-2xl p-6 mb-6 hover:shadow-blue-300/50 transition-all duration-300">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Select a Subject to Book</h2>
              
              {tutor.subjects.length === 0 ? (
                <p className="text-gray-600">No subjects listed</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tutor.subjects.map(subject => (
                    <button
                      key={subject.id}
                      onClick={() => handleSubjectClick(subject)}
                      className={`
                        p-4 rounded-xl border-2 transition-all duration-200 text-left shadow-md
                        ${selectedSubject?.id === subject.id
                          ? 'border-purple-600 bg-gradient-to-br from-purple-50 to-pink-50 shadow-lg shadow-purple-600/30 scale-105'
                          : 'border-gray-300 bg-white hover:border-purple-600 hover:shadow-lg hover:scale-102'
                        }
                      `}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-gray-900 mb-1">{subject.name}</h3>
                          <p className="text-sm text-gray-600">{subject.curriculum}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-purple-600">
                            {process.env.NEXT_PUBLIC_ENABLE_PAID_SESSIONS === 'true' 
                              ? `$${subject.price_per_hour_ttd}`
                              : 'FREE'}
                          </p>
                          <p className="text-xs text-gray-600">
                            {process.env.NEXT_PUBLIC_ENABLE_PAID_SESSIONS === 'true' ? 'per hour' : 'sessions'}
                          </p>
                        </div>
                      </div>
                      {selectedSubject?.id === subject.id && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-purple-600 font-semibold">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Selected
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Calendar Widget */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Available Times</h2>
              
              {!selectedSubject ? (
                <div className="bg-white border-2 border-purple-200 shadow-xl rounded-2xl p-12 text-center hover:shadow-purple-300/50 transition-all duration-300">
                  <svg className="w-16 h-16 text-purple-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <p className="text-gray-700 mb-2 text-lg font-semibold">Select a subject above to view available times</p>
                  <p className="text-gray-600 text-sm">Choose what your child would like to learn</p>
                </div>
              ) : (
                <>
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-600 rounded-xl p-4 mb-4 shadow-md">
                    <div className="flex items-center gap-2 text-purple-700 text-sm font-semibold">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Booking: {selectedSubject.name} • {process.env.NEXT_PUBLIC_ENABLE_PAID_SESSIONS === 'true' 
                        ? `$${selectedSubject.price_per_hour_ttd}/hour`
                        : 'FREE sessions'}
                    </div>
                  </div>
                  <TutorCalendarWidget
                    tutorId={tutorId}
                    onSlotSelect={handleSlotSelect}
                  />
                </>
              )}
            </div>
          </div>

          {/* Reviews */}
          <div className="lg:col-span-1">
            <div className="bg-white border-2 border-yellow-200 shadow-xl rounded-2xl p-6 hover:shadow-yellow-300/50 transition-all duration-300">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <h2 className="text-xl font-bold text-gray-900">Reviews</h2>
              </div>
              
              {tutor.ratings.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <p className="text-gray-600 text-sm">No reviews yet</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                  {tutor.ratings.map(rating => (
                    <RatingComment 
                      key={rating.id} 
                      rating={rating}
                      onReactionUpdate={fetchTutorProfile}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Booking Request Modal */}
      {selectedTimeSlot && selectedSubject && selectedChild && (
        <BookingRequestModal
          isOpen={bookingModalOpen}
          onClose={() => {
            setBookingModalOpen(false);
            setSelectedTimeSlot(null);
          }}
          tutorId={tutorId}
          tutorName={getDisplayName(tutor)}
          studentId={selectedChild.id}
          subjectId={selectedSubject.id}
          subjectName={selectedSubject.name}
          pricePerHour={selectedSubject.price_per_hour_ttd}
          selectedStartAt={selectedTimeSlot.start}
          selectedEndAt={selectedTimeSlot.end}
          onSuccess={handleBookingSuccess}
        />
      )}

      {/* Verified Subjects Modal */}
      <VerifiedSubjectsModal
        isOpen={verifiedSubjectsModalOpen}
        onClose={() => setVerifiedSubjectsModalOpen(false)}
        tutorId={tutorId}
        tutorName={getDisplayName(tutor)}
      />
    </DashboardLayout>
  );
}

