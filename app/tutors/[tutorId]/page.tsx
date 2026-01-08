'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import TutorCalendarWidget from '@/components/booking/TutorCalendarWidget';
import VerifiedBadge from '@/components/VerifiedBadge';
import VerifiedSubjectsButton from '@/components/tutor/VerifiedSubjectsButton';
import VerifiedSubjectsModal from '@/components/tutor/VerifiedSubjectsModal';
import RatingComment from '@/components/tutor/RatingComment';
import Link from 'next/link';

type TutorProfile = {
  id: string;
  full_name: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  school: string | null;
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

export default function PublicTutorProfilePage() {
  const router = useRouter();
  const params = useParams();
  const tutorId = params.tutorId as string;
  
  const [tutor, setTutor] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<TutorProfile['subjects'][0] | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{ start: string; end: string } | null>(null);
  const [verifiedSubjectsModalOpen, setVerifiedSubjectsModalOpen] = useState(false);
  const [verifiedSubjects, setVerifiedSubjects] = useState<any[]>([]);
  const [csecSubjects, setCsecSubjects] = useState<any[]>([]);
  const [capeSubjects, setCapeSubjects] = useState<any[]>([]);
  const [showBookingPrompt, setShowBookingPrompt] = useState(false);

  useEffect(() => {
    fetchTutorProfile();
    fetchVerifiedSubjects();
  }, [tutorId]);

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
      // Fetch tutor profile
      const { data: tutorData, error: tutorError } = await supabase
        .from('profiles')
        .select('id, full_name, username, display_name, avatar_url, institution_id, country, bio, tutor_verification_status')
        .eq('id', tutorId)
        .eq('role', 'tutor')
        .single();

      if (tutorError) throw tutorError;
      if (!tutorData) {
        alert('Tutor not found');
        router.push('/');
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
        console.error('Error fetching ratings:', ratingsError);
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
          console.error('Error fetching student names:', studentsError);
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

  const handleBookSession = () => {
    if (!selectedSubject || !selectedTimeSlot) {
      alert('Please select a subject and time slot');
      return;
    }
    setShowBookingPrompt(true);
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Logo and Auth Buttons - Black like dashboard */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex-shrink-0">
              <img
                src="/assets/logo/itutor-logo-dark.png"
                alt="iTutor"
                className="h-12 w-auto"
              />
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/signup"
                className="px-4 py-2 text-sm font-semibold text-white hover:text-itutor-green transition-colors"
              >
                Sign Up
              </Link>
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-semibold text-gray-900 bg-itutor-green hover:bg-emerald-500 rounded-lg transition-colors"
              >
                Log In
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 sm:px-0">
        {/* Back to Search Button */}
        <button
          onClick={() => router.push('/')}
          className="mb-6 text-itutor-green hover:text-emerald-600 flex items-center gap-2 transition-colors font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Search
        </button>

        {/* Profile Header - Matching student view */}
        <div className="bg-white border-2 border-indigo-200 shadow-xl rounded-2xl p-8 mb-6 hover:shadow-indigo-300/50 transition-all duration-300">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Avatar */}
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-itutor-green to-emerald-600 flex items-center justify-center text-white font-bold text-4xl flex-shrink-0 shadow-lg">
              {tutor.avatar_url ? (
                <img src={tutor.avatar_url} alt={displayName} className="w-full h-full rounded-full object-cover" />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                {displayName}
                {tutor.tutor_verification_status === 'verified' && <VerifiedBadge size="lg" />}
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
                    <svg className="h-4 w-4 text-itutor-green flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {tutor.bio}
                    </p>
                  </div>
                </div>
              )}

              {/* Verified Subjects Button */}
              {tutor.tutor_verification_status === 'verified' && (
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

        {/* Two-column layout: Verified CXC Results and Reviews */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Verified CXC Results - Left Column */}
          {tutor.tutor_verification_status === 'verified' && verifiedSubjects.length > 0 ? (
            <div className="lg:col-span-2">
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 shadow-xl rounded-2xl p-6 hover:shadow-green-300/50 transition-all duration-300">
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
                        {csecSubjects.map((subject) => (
                          <div key={subject.id} className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-green-400 hover:shadow-md transition-all">
                            <h4 className="font-semibold text-gray-900 mb-2">{subject.subject_name}</h4>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-sm font-bold text-green-700">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                                Grade {subject.grade}
                              </span>
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
                        {capeSubjects.map((subject) => (
                          <div key={subject.id} className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-green-400 hover:shadow-md transition-all">
                            <h4 className="font-semibold text-gray-900 mb-2">{subject.subject_name}</h4>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-sm font-bold text-green-700">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                                Grade {subject.grade}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-500 mt-4 text-center">
                  Results verified by iTutor. CXC is a trademark of the Caribbean Examinations Council.
                </p>
              </div>
            </div>
          ) : null}

          {/* Reviews - Right Column */}
          <div className={tutor.tutor_verification_status === 'verified' && verifiedSubjects.length > 0 ? 'lg:col-span-1' : 'lg:col-span-3'}>
            <div className="bg-white border-2 border-yellow-200 shadow-xl rounded-2xl p-6 hover:shadow-yellow-300/50 transition-all duration-300 h-full">
              <div className="flex items-center gap-3 mb-6">
                <svg className="w-8 h-8 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <h2 className="text-2xl font-bold text-gray-900">Reviews</h2>
              </div>

              {tutor.ratings.length > 0 ? (
                <div className="space-y-4">
                  {tutor.ratings.map((rating) => (
                    <RatingComment 
                      key={rating.id} 
                      rating={rating}
                      onReactionUpdate={fetchTutorProfile}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <svg className="w-16 h-16 text-gray-300 mx-auto mb-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <p className="text-gray-500">No reviews yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Select a Subject to Book */}
        <div className="bg-white border-2 border-indigo-200 shadow-xl rounded-2xl p-8 mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Select a Subject to Book</h2>
          
          {tutor.subjects.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No subjects listed</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tutor.subjects.map((subject) => (
                <button
                  key={subject.id}
                  onClick={() => setSelectedSubject(subject)}
                  className={`p-6 rounded-xl border-2 transition-all duration-200 text-left ${
                    selectedSubject?.id === subject.id
                      ? 'border-itutor-green bg-gradient-to-br from-green-50 to-emerald-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-gray-900 text-lg">{subject.name}</h3>
                    <span className="text-2xl font-bold text-itutor-green">${subject.price_per_hour_ttd}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">{subject.curriculum}</p>
                  <p className="text-xs text-gray-500">per hour</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Available Times */}
        <div className="bg-white border-2 border-indigo-200 shadow-xl rounded-2xl p-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Available Times</h2>
          
          {!selectedSubject ? (
            <div className="text-center py-12">
              <svg className="w-20 h-20 text-purple-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <p className="text-gray-500 text-lg">Select a subject above to view available times</p>
            </div>
          ) : (
            <>
              <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg">
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  📚 {selectedSubject.name}
                </p>
                <p className="text-xs text-gray-600">
                  {selectedSubject.curriculum} • ${selectedSubject.price_per_hour_ttd}/hour
                </p>
              </div>

              <TutorCalendarWidget
                tutorId={tutorId}
                onSlotSelect={(startAt, endAt) => setSelectedTimeSlot({ start: startAt, end: endAt })}
              />

              <button
                onClick={handleBookSession}
                disabled={!selectedTimeSlot}
                className={`w-full mt-6 py-4 rounded-lg font-bold text-white transition shadow-lg text-lg ${
                  selectedTimeSlot
                    ? 'bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green shadow-green-300'
                    : 'bg-gray-300 cursor-not-allowed'
                }`}
              >
                {selectedTimeSlot ? '✓ Confirm Booking' : 'Select a time slot'}
              </button>
            </>
          )}
        </div>

      </div>

      {/* Verified Subjects Modal */}
      <VerifiedSubjectsModal
        isOpen={verifiedSubjectsModalOpen}
        onClose={() => setVerifiedSubjectsModalOpen(false)}
        tutorId={tutorId}
        tutorName={displayName}
      />

      {/* Sign Up Prompt Modal */}
      {showBookingPrompt && selectedSubject && selectedTimeSlot && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full relative border-4 border-itutor-green shadow-2xl shadow-itutor-green/30">
            <button
              onClick={() => setShowBookingPrompt(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-itutor-green to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-2">🎓 Almost there!</h3>
              <p className="text-gray-600 mb-6">
                Sign up or log in to complete your booking
              </p>

              {/* Booking Summary */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-5 mb-6 text-left">
                <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Booking Summary
                </h4>
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
                      {new Date(selectedTimeSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedTimeSlot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-blue-300">
                    <span className="text-gray-600">Price:</span>
                    <span className="font-bold text-itutor-green text-lg">${selectedSubject.price_per_hour_ttd}/hr</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Link
                href="/signup"
                className="w-full px-6 py-4 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white font-bold rounded-lg transition shadow-lg shadow-itutor-green/30 text-center"
              >
                🚀 Sign Up to Book
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

