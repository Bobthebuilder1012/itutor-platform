'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import { getDisplayName } from '@/lib/utils/displayName';

type Student = {
  id: string;
  full_name: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  school: string | null;
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
      
      // Fetch all student profiles with subjects_of_study array
      const { data: studentProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, username, display_name, avatar_url, institution_id, form_level, country, bio, subjects_of_study')
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
  }, [students, searchQuery, selectedSubjects, selectedFormLevel, profile]);

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

        {/* Search and Filters */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl p-6 mb-6">
          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search students by name..."
                className="w-full px-4 py-3 pl-11 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-500"
              />
              <svg className="absolute left-3 top-3.5 h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Filter by Subject Interests
              </label>
              <SubjectMultiSelect
                selectedSubjects={selectedSubjects}
                onChange={setSelectedSubjects}
                placeholder="Select subjects to filter..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Form Level
              </label>
              <select
                value={selectedFormLevel}
                onChange={(e) => setSelectedFormLevel(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition"
              >
                <option value="">Any Level</option>
                <option value="Form 1">Form 1</option>
                <option value="Form 2">Form 2</option>
                <option value="Form 3">Form 3</option>
                <option value="Form 4">Form 4</option>
                <option value="Form 5">Form 5</option>
                <option value="Lower 6">Lower 6</option>
                <option value="Upper 6">Upper 6</option>
              </select>
            </div>
          </div>

          {/* Clear Filters */}
          {(searchQuery || selectedSubjects.length > 0 || selectedFormLevel) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedSubjects([]);
                setSelectedFormLevel('');
              }}
              className="mt-4 text-sm text-itutor-green hover:text-emerald-400 font-medium transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>

        {/* Results Count */}
        <div className="mb-4">
          <p className="text-gray-600 text-sm">
            Showing {filteredStudents.length} {filteredStudents.length === 1 ? 'student' : 'students'}
          </p>
        </div>

        {/* Students Grid */}
        {loadingStudents ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading students...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="text-center py-12 bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl">
            <div className="bg-gray-800 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <svg className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-gray-600 mb-2">No students found</p>
            <p className="text-sm text-gray-500">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredStudents.map(student => {
              // Check if tutor teaches any of the student's subjects
              const matchesTutorSubjects = profile.subjects_of_study?.some(tutorSubject =>
                student.subjectDetails.some(studentSubject => studentSubject.name === tutorSubject)
              );

              return (
                <div
                  key={student.id}
                  className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-2xl p-6 hover:shadow-xl hover:border-blue-400 transition-all duration-300 hover:scale-105"
                >
                  {/* Matched Badge */}
                  {matchesTutorSubjects && (
                    <div className="mb-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-itutor-green to-emerald-600 text-white">
                        ⭐ Matches Your Subjects
                      </span>
                    </div>
                  )}

                  {/* Student Info */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                      {student.avatar_url ? (
                        <img src={student.avatar_url} alt={getDisplayName(student)} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        getDisplayName(student).charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-gray-900 truncate">
                        {getDisplayName(student)}
                      </h3>
                      {student.username && (
                        <p className="text-xs text-gray-500 truncate">@{student.username}</p>
                      )}
                      {student.school && (
                        <p className="text-sm text-gray-600 truncate">{student.school}</p>
                      )}
                      {student.form_level && (
                        <p className="text-xs text-gray-500 mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
                            {student.form_level}
                          </span>
                        </p>
                      )}
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
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-2 font-medium">Studying:</p>
                    <div className="flex flex-wrap gap-1">
                      {student.subjectDetails.slice(0, 4).map(subject => (
                        <span
                          key={subject.id}
                          className="text-xs px-2 py-1 rounded bg-white border border-gray-300 text-gray-700"
                        >
                          {subject.name}
                        </span>
                      ))}
                      {student.subjectDetails.length > 4 && (
                        <span className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300">
                          +{student.subjectDetails.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* View Profile Button */}
                  <button
                    onClick={() => router.push(`/tutor/students/${student.id}`)}
                    className="w-full bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-2 px-4 rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-itutor-green/50"
                  >
                    View Profile
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

