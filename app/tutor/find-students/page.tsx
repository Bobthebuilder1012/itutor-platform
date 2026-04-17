'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import { getDisplayName } from '@/lib/utils/displayName';
import UserAvatar from '@/components/UserAvatar';

type Student = {
  id: string;
  full_name: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  school?: string | null;
  institution_id?: string | null;
  form_level: string | null;
  country: string;
  bio: string | null;
  subjects_of_study: string[];
  subjectDetails: Array<{
    id: string;
    name: string;
    curriculum: string;
    level: string;
  }>;
};

export default function FindStudentsPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedFormLevel, setSelectedFormLevel] = useState<string>('');
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [availableSchools, setAvailableSchools] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const STUDENTS_PER_PAGE = 12;

  useEffect(() => {
    if (loading) return;
    
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    fetchStudents();
  }, [profile, loading, router]);

  async function fetchStudents() {
    setLoadingStudents(true);
    try {
      console.log('=== STARTING STUDENT FETCH ===');
      
      // Fetch all student profiles with subjects_of_study array and school
      const { data: studentProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, username, display_name, avatar_url, school, institution_id, form_level, country, bio, subjects_of_study')
        .eq('role', 'student');

      if (profilesError) {
        console.error('❌ Error fetching student profiles:', profilesError);
        console.error('Error details:', JSON.stringify(profilesError, null, 2));
        alert(`Error loading students: ${profilesError.message}`);
        throw profilesError;
      }

      if (!studentProfiles || studentProfiles.length === 0) {
        console.log('No students found');
        setStudents([]);
        return;
      }

      console.log(`✅ Fetched ${studentProfiles.length} student profiles`);

      const studentIds = studentProfiles.map(s => s.id);

      // Fetch subjects for these students using the junction table
      let userSubjectsData = null;
      if (studentIds.length > 0) {
        const { data, error: userSubjectsError } = await supabase
          .from('user_subjects')
          .select('user_id, subject:subjects(id, name, label, curriculum, level)')
          .in('user_id', studentIds);

        if (userSubjectsError) {
          console.error('❌ Error fetching student subjects:', userSubjectsError);
          console.error('Error details:', JSON.stringify(userSubjectsError, null, 2));
          // Don't throw, just continue without junction table data
        } else {
          userSubjectsData = data;
        }
      }
      
      console.log('✅ Fetched user subjects data:', userSubjectsData?.length || 0);

      // Fetch all subjects for mapping array data
      const { data: allSubjectsData, error: allSubjectsError } = await supabase
        .from('subjects')
        .select('id, name, label, curriculum, level')
        .eq('is_active', true);

      if (allSubjectsError) {
        console.error('❌ Error fetching subjects:', allSubjectsError);
        console.error('Error details:', JSON.stringify(allSubjectsError, null, 2));
        // Continue without subjects map
      }

      const subjectsMap = new Map(allSubjectsData?.map(s => [s.label || s.name, s]) || []);
      console.log('Subjects map size:', subjectsMap.size);

      // Create a map of student profiles
      const studentsMap = new Map<string, Student>();
      
      // Initialize all students with their profile data
      studentProfiles.forEach(profile => {
        studentsMap.set(profile.id, {
          ...profile,
          subjects_of_study: profile.subjects_of_study || [],
          subjectDetails: []
        });
      });
      
      // Add subject data from junction table
      userSubjectsData?.forEach((entry: any) => {
        if (!entry.subject) return;
        
        const student = studentsMap.get(entry.user_id);
        if (!student) return;
        
        const subjectLabel = entry.subject.label || entry.subject.name;
        if (!student.subjects_of_study.includes(subjectLabel)) {
          student.subjects_of_study.push(subjectLabel);
        }
        
        student.subjectDetails.push({
          id: entry.subject.id,
          name: subjectLabel,
          curriculum: entry.subject.curriculum || entry.subject.level || '',
          level: entry.subject.level || ''
        });
      });

      // For students without junction table data, use subjects_of_study array
      Array.from(studentsMap.values()).forEach(student => {
        if (student.subjectDetails.length === 0 && student.subjects_of_study.length > 0) {
          student.subjects_of_study.forEach(label => {
            const subject = subjectsMap.get(label);
            if (subject) {
              student.subjectDetails.push({
                id: subject.id,
                name: subject.label || subject.name,
                curriculum: subject.curriculum || subject.level || '',
                level: subject.level || ''
              });
            } else {
              // Subject not found in map, add basic info
              console.warn(`Subject not found in map: ${label}`);
              student.subjectDetails.push({
                id: label, // Use label as fallback ID
                name: label,
                curriculum: '',
                level: ''
              });
            }
          });
        }
      });

      // Filter to only students with subjects
      const studentsWithData = Array.from(studentsMap.values())
        .filter(s => s.subjectDetails.length > 0);

      console.log('=== STUDENT LOADING SUMMARY ===');
      console.log('Total students:', studentProfiles.length);
      console.log('Students with subjects:', studentsWithData.length);
      console.log('Sample student data:', studentsWithData.slice(0, 2));

      // Extract unique schools for filter
      const schools = [...new Set(studentsWithData.map(s => s.school).filter(Boolean))] as string[];
      setAvailableSchools(schools.sort());

      setStudents(studentsWithData);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoadingStudents(false);
    }
  }

  const filteredStudents = useMemo(() => {
    console.log('Filtering students. Total students:', students.length);
    let filtered = [...students];

    // Search by name (display name, username, or full name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(student => {
        const displayName = getDisplayName(student).toLowerCase();
        const username = student.username?.toLowerCase() || '';
        const fullName = student.full_name?.toLowerCase() || '';
        
        return displayName.includes(query) || 
               username.includes(query) || 
               fullName.includes(query);
      });
    }

    // Filter by subject
    if (selectedSubjects.length > 0) {
      filtered = filtered.filter(student =>
        student.subjectDetails.some(s => selectedSubjects.includes(s.name))
      );
    }

    // Filter by form level
    if (selectedFormLevel) {
      filtered = filtered.filter(student =>
        student.form_level === selectedFormLevel
      );
    }

    // Filter by school
    if (selectedSchool) {
      filtered = filtered.filter(student => student.school === selectedSchool);
    }

    // Sort: Prioritize students studying tutor's subjects, then by newest
    if (profile?.subjects_of_study && profile.subjects_of_study.length > 0) {
      filtered.sort((a, b) => {
        const aMatchesSubjects = a.subjectDetails.some(s =>
          profile.subjects_of_study?.includes(s.name)
        );
        const bMatchesSubjects = b.subjectDetails.some(s =>
          profile.subjects_of_study?.includes(s.name)
        );

        if (aMatchesSubjects && !bMatchesSubjects) return -1;
        if (!aMatchesSubjects && bMatchesSubjects) return 1;

        return 0; // Keep original order (newest first) if both match or both don't
      });
    }

    console.log('After filtering:', filtered.length);
    return filtered;
  }, [students, searchQuery, selectedSubjects, selectedFormLevel, selectedSchool, profile]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedSubjects, selectedFormLevel, selectedSchool]);

  const totalPages = Math.ceil(filteredStudents.length / STUDENTS_PER_PAGE);
  const pagedStudents = filteredStudents.slice(
    (currentPage - 1) * STUDENTS_PER_PAGE,
    currentPage * STUDENTS_PER_PAGE
  );

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  return (
    <DashboardLayout role="tutor" userName={getDisplayName(profile)}>
      <div className="px-4 py-3 sm:px-0">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Find Students</h1>
          <p className="text-gray-600">Discover students looking for tutoring in your subjects</p>
        </div>

        {/* ── FILTER PANEL ── */}
        {(() => {
          const hasActive = !!(searchQuery || selectedSubjects.length > 0 || selectedFormLevel || selectedSchool);
          return (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm mb-6 overflow-hidden">

              {/* Search + toggle row */}
              <div className="px-4 py-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search students by name or username..."
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none focus:bg-white transition text-sm" />
                </div>

                {hasActive && (
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-itutor-green text-white text-[10px] font-bold flex items-center justify-center">
                    {[selectedSubjects.length > 0, selectedSchool, selectedFormLevel].filter(Boolean).length}
                  </span>
                )}

                <button onClick={() => setFiltersOpen(o => !o)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    filtersOpen ? 'bg-itutor-green/10 border-itutor-green text-itutor-green' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/>
                  </svg>
                  <span className="hidden sm:inline">Filters</span>
                  <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>

                <button className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-itutor-green text-white text-sm font-semibold hover:bg-emerald-700 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                  <span className="hidden sm:inline">Search</span>
                </button>
              </div>

              {/* Expandable filters */}
              {filtersOpen && (
                <div className="border-t border-gray-100">
                  <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Subjects</p>
                      <SubjectMultiSelect selectedSubjects={selectedSubjects} onChange={setSelectedSubjects} placeholder="Type a subject..." />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">School</p>
                      <div className="relative">
                        <select value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition text-sm appearance-none pr-8">
                          <option value="">All schools</option>
                          {availableSchools.map(school => <option key={school} value={school}>{school}</option>)}
                        </select>
                        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Form Level</p>
                      <div className="relative">
                        <select value={selectedFormLevel} onChange={(e) => setSelectedFormLevel(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition text-sm appearance-none pr-8">
                          <option value="">Any level</option>
                          <option value="Form 1">Form 1</option>
                          <option value="Form 2">Form 2</option>
                          <option value="Form 3">Form 3</option>
                          <option value="Form 4">Form 4</option>
                          <option value="Form 5">Form 5</option>
                          <option value="Lower 6">Lower 6</option>
                          <option value="Upper 6">Upper 6</option>
                        </select>
                        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                      </div>
                    </div>
                  </div>
                  {hasActive && (
                    <div className="px-4 pb-3 flex justify-end">
                      <button onClick={() => { setSearchQuery(''); setSelectedSubjects([]); setSelectedFormLevel(''); setSelectedSchool(''); }}
                        className="text-xs px-3 py-1.5 rounded-full border border-red-200 text-red-400 hover:bg-red-50 transition font-medium">
                        Clear all
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Results bar */}
              <div className={`px-4 py-2.5 flex items-center justify-between ${filtersOpen ? 'border-t border-gray-100' : ''}`}>
                <p className="text-sm font-semibold text-itutor-green">
                  {filteredStudents.length >= 100 ? '100+' : filteredStudents.length} Students Found
                  {totalPages > 1 && <span className="text-gray-400 font-normal ml-2 text-xs">page {currentPage} of {totalPages}</span>}
                </p>
                {hasActive && !filtersOpen && (
                  <button onClick={() => { setSearchQuery(''); setSelectedSubjects([]); setSelectedFormLevel(''); setSelectedSchool(''); }}
                    className="text-xs text-gray-400 hover:text-red-400 transition font-medium">Clear filters</button>
                )}
              </div>
            </div>
          );
        })()}

        {/* Students Grid */}
        {loadingStudents ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading students...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="text-center py-12 bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
            <div className="bg-gray-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-gray-700 mb-2 font-medium">No students found</p>
            <p className="text-sm text-gray-500">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {pagedStudents.map(student => {
              // Check if tutor teaches any of the student's subjects
              const matchesTutorSubjects = profile.subjects_of_study?.some(tutorSubject =>
                student.subjectDetails.some(studentSubject => studentSubject.name === tutorSubject)
              );

              return (
                <div
                  key={student.id}
                  className="bg-white border-2 border-gray-200 rounded-2xl p-4 hover:shadow-xl hover:border-itutor-green transition-all duration-300 flex flex-col"
                >
                  {/* Matched Badge */}
                  {matchesTutorSubjects && (
                    <div className="mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-itutor-green to-emerald-600 text-white">
                        ⭐ Matches Your Subjects
                      </span>
                    </div>
                  )}

                  {/* Student Info */}
                  <div className="flex items-start gap-3 mb-3">
                    <UserAvatar avatarUrl={student.avatar_url} name={getDisplayName(student)} size={56} />
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-gray-900 truncate">
                          {getDisplayName(student)}
                        </h3>
                        {student.username && (
                          <p className="text-xs text-gray-500 truncate">@{student.username}</p>
                        )}
                        {student.form_level && (
                          <p className="mt-1 text-xs text-gray-500">
                            <span className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 font-medium text-blue-800">
                              {student.form_level}
                            </span>
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => router.push(`/tutor/students/${student.id}`)}
                        aria-label={`Open ${getDisplayName(student)}'s profile`}
                        className="flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-full border border-itutor-green/55 bg-itutor-green/15 text-itutor-green shadow-sm transition hover:bg-itutor-green/25 hover:border-itutor-green"
                      >
                        <span className="text-[15px] font-extrabold leading-none" aria-hidden>
                          !
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Bio */}
                  {student.bio && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-700 line-clamp-2">
                        {student.bio}
                      </p>
                    </div>
                  )}

                  {/* Subjects */}
                  <div className="mt-auto flex-1">
                    <p className="mb-1.5 text-xs font-medium text-gray-500">Studying:</p>
                    <div className="flex flex-wrap gap-1">
                      {student.subjectDetails.slice(0, 4).map(subject => (
                        <span
                          key={subject.id}
                          className="text-xs px-2 py-1 rounded bg-gray-50 border border-gray-300 text-gray-700"
                        >
                          {subject.name}
                        </span>
                      ))}
                      {student.subjectDetails.length > 4 && (
                        <span className="text-xs px-2 py-1 rounded bg-gray-100 border border-gray-300 text-gray-700 font-medium">
                          +{student.subjectDetails.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-gray-200 bg-white text-gray-700 font-medium text-sm transition-all hover:border-itutor-green hover:text-itutor-green disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-9 h-9 rounded-lg text-sm font-semibold transition-all ${
                    page === currentPage
                      ? 'bg-itutor-green text-white shadow-md'
                      : 'border-2 border-gray-200 bg-white text-gray-600 hover:border-itutor-green hover:text-itutor-green'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-gray-200 bg-white text-gray-700 font-medium text-sm transition-all hover:border-itutor-green hover:text-itutor-green disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-700"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

