'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import SendOfferModal from '@/components/offers/SendOfferModal';
import { getDisplayName } from '@/lib/utils/displayName';
import { getAvatarColor } from '@/lib/utils/avatarColors';

type StudentProfile = {
  id: string;
  full_name: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  school?: string | null;
  institution_id?: string | null;
  country: string;
  subjects_of_study: string[] | null;
  bio: string | null;
  created_at?: string;
};

type Subject = {
  id: string;
  name: string;
  label: string;
  curriculum: string;
  level: string;
};

export default function StudentProfilePage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const studentId = params.studentId as string;
  
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [showAboutMenu, setShowAboutMenu] = useState(false);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    fetchStudentProfile();
  }, [profile, profileLoading, router, studentId]);

  async function fetchStudentProfile() {
    setLoading(true);
    setError('');

    try {
      // Fetch student profile
      const { data: studentData, error: studentError } = await supabase
        .from('profiles')
        .select('id, full_name, username, display_name, avatar_url, institution_id, country, subjects_of_study, bio, created_at')
        .eq('id', studentId)
        .eq('role', 'student')
        .single();

      if (studentError) {
        console.error('Error fetching student:', studentError);
        throw new Error('Failed to load student profile. Make sure you have permission to view this profile.');
      }

      if (!studentData) {
        setError('Student not found');
        setLoading(false);
        return;
      }

      setStudent(studentData);

      // Fetch completed sessions count
      const { count, error: sessionsError } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .eq('status', 'COMPLETED_ASSUMED');

      if (!sessionsError && count !== null) {
        setCompletedSessions(count);
      }

      // Fetch subject details if student has subjects_of_study
      if (studentData.subjects_of_study && studentData.subjects_of_study.length > 0) {
        try {
          // Check if subjects_of_study contains UUIDs or names
          const firstItem = studentData.subjects_of_study[0];
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(firstItem);
          
          if (isUUID) {
            // If UUIDs, query by ID
            const { data: subjectsData, error: subjectsError } = await supabase
              .from('subjects')
              .select('id, name, label, curriculum, level')
              .in('id', studentData.subjects_of_study);

            if (subjectsError) {
              console.error('Error fetching subjects by ID:', subjectsError);
            } else {
              setSubjects(subjectsData || []);
            }
          } else {
            // If names/labels, fetch all subjects and filter in JS
            const { data: allSubjects, error: subjectsError } = await supabase
              .from('subjects')
              .select('id, name, label, curriculum, level');

            if (subjectsError) {
              console.error('Error fetching all subjects:', subjectsError);
            } else if (allSubjects) {
              // Filter subjects that match the student's list
              const matchedSubjects = allSubjects.filter(subject => 
                studentData.subjects_of_study.includes(subject.name) || 
                studentData.subjects_of_study.includes(subject.label)
              );
              setSubjects(matchedSubjects);
            }
          }
        } catch (err) {
          console.error('Error processing subjects:', err);
        }
      }
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'Failed to load student profile');
    } finally {
      setLoading(false);
    }
  }

  if (profileLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <DashboardLayout role="tutor" userName={getDisplayName(profile!)}>
        <div className="px-4 py-6 sm:px-0 max-w-5xl mx-auto">
          <button
            onClick={() => router.back()}
            className="mb-6 text-itutor-green hover:text-emerald-600 flex items-center gap-2 transition-colors font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>

          <div className="text-center py-12 bg-white border-2 border-red-200 rounded-2xl shadow-lg">
            <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-gray-900 mb-2 font-semibold">{error || 'Student not found'}</p>
            <p className="text-sm text-gray-600">You may not have permission to view this profile</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <DashboardLayout role="tutor" userName={getDisplayName(profile!)}>
      <div className="px-4 py-6 sm:px-0 max-w-6xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="mb-6 text-itutor-green hover:text-emerald-600 flex items-center gap-2 transition-colors font-semibold text-lg"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>

        {/* Student Profile Card */}
        <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 p-8 mb-6">
          <div>
            <div className="flex flex-col md:flex-row gap-8 items-start">
              {/* Avatar */}
              <div className={`w-28 h-28 rounded-full flex-shrink-0 shadow-md ${!student.avatar_url ? `bg-gradient-to-br ${getAvatarColor(student.id)} flex items-center justify-center` : ''}`}>
                {student.avatar_url ? (
                  <img src={student.avatar_url} alt={getDisplayName(student)} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white font-bold text-3xl">
                    {getInitials(getDisplayName(student))}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <h1 className="text-3xl font-bold text-gray-900 mb-2">{getDisplayName(student)}</h1>
                      
                      {/* Three-dots menu */}
                      <div className="relative">
                        <button
                          onClick={() => setShowAboutMenu(!showAboutMenu)}
                          className="p-2 hover:bg-gray-100 rounded-full transition"
                        >
                          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                          </svg>
                        </button>

                        {/* Dropdown menu */}
                        {showAboutMenu && (
                          <>
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setShowAboutMenu(false)}
                            />
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20">
                              <button
                                onClick={() => {
                                  setShowAboutMenu(false);
                                  const aboutSection = document.getElementById('about-section');
                                  aboutSection?.scrollIntoView({ behavior: 'smooth' });
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                About
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {student.username && (
                      <p className="text-gray-600 mb-3">@{student.username}</p>
                    )}
                    
                    <div className="flex items-center gap-2 mb-4">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                        Student
                      </span>
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        {completedSessions} Completed {completedSessions === 1 ? 'Session' : 'Sessions'}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-3 text-sm text-gray-700">
                      {student.school && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                          <span>{student.school}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>{student.country}</span>
                      </div>
                    </div>
                  </div>

                  {/* Send Offer Button */}
                  <button
                    onClick={() => setOfferModalOpen(true)}
                    className="px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-xl font-semibold shadow-lg hover:shadow-itutor-green/50 transition-all duration-300 flex items-center gap-2 whitespace-nowrap"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                    </svg>
                    Send Lesson Offer
                  </button>
                </div>

                {/* Biography - Just the text */}
                {student.bio && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {student.bio}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* About Section */}
        <div id="about-section" className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-6 h-6 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            About
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <div className="w-10 h-10 bg-itutor-green/10 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Member Since</p>
                <p className="text-sm font-semibold text-gray-900">
                  {student.created_at ? new Date(student.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'N/A'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Completed Sessions</p>
                <p className="text-sm font-semibold text-gray-900">{completedSessions}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Subjects of Study */}
        <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Subjects Studying</h2>
          
          {subjects.length === 0 ? (
            <p className="text-gray-600 text-center py-8">No subjects listed</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {subjects.map(subject => (
                <div
                  key={subject.id}
                  className="p-4 rounded-xl border-2 border-gray-200 bg-gradient-to-br from-gray-50 to-white hover:border-itutor-green/30 hover:shadow-md transition-all duration-300"
                >
                  <h3 className="font-semibold text-gray-900 mb-1">
                    {subject.label || subject.name}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {subject.curriculum} • {subject.level}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Send Offer Modal */}
      <SendOfferModal
        isOpen={offerModalOpen}
        onClose={() => setOfferModalOpen(false)}
        studentId={student.id}
        studentName={getDisplayName(student)}
      />
    </DashboardLayout>
  );
}

