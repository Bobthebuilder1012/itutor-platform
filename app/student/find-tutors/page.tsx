'use client';

'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import { getDisplayName } from '@/lib/utils/displayName';
import VerifiedBadge from '@/components/VerifiedBadge';
import { getAvatarColor } from '@/lib/utils/avatarColors';

type Tutor = {
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
  rating_average?: number | null;
  rating_count?: number | null;
  subjects: Array<{
    id: string;
    name: string;
    curriculum: string;
    level: string;
    price_per_hour_ttd: number;
  }>;
  average_rating: number | null;
  total_reviews: number;
  topComment: {
    comment: string;
    stars: number;
    student_name: string;
  } | null;
};

export default function FindTutorsPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loadingTutors, setLoadingTutors] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedRating, setSelectedRating] = useState<string>('');
  const [selectedPrice, setSelectedPrice] = useState<string>('');
  const [paidClassesEnabled, setPaidClassesEnabled] = useState<boolean>(false);
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [availableSchools, setAvailableSchools] = useState<string[]>([]);

  useEffect(() => {
    if (loading) return;
    
    if (!profile || profile.role !== 'student') {
      router.push('/login');
      return;
    }

    fetchPaidClassesFlag();
    fetchTutors();
  }, [profile, loading, router]);

  async function fetchPaidClassesFlag() {
    try {
      const res = await fetch('/api/feature-flags', { cache: 'no-store' });
      const data = await res.json();
      setPaidClassesEnabled(Boolean(data?.paidClassesEnabled));
    } catch {
      setPaidClassesEnabled(false);
    }
  }

  async function fetchTutors() {
    setLoadingTutors(true);
    try {
      console.log('=== STARTING TUTOR FETCH ===');
      
      // Fetch all tutor profiles with bio and school
      const { data: tutorProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select(
          'id, full_name, username, display_name, avatar_url, school, institution_id, country, bio, tutor_verification_status, rating_average, rating_count'
        )
        .eq('role', 'tutor')
        .order('tutor_verification_status', { ascending: false, nullsFirst: false }); // Verified tutors first

      if (profilesError) {
        console.error('❌ Error fetching tutor profiles:', profilesError);
        alert(`Error loading tutors: ${profilesError.message}`);
        throw profilesError;
      }
      
      console.log('✅ Fetched tutor profiles:', tutorProfiles?.length || 0);
      console.log('Tutor profiles data:', tutorProfiles);

      // Filter out tutors without video provider connections
      const { data: videoConnections, error: connectionsError } = await supabase
        .from('tutor_video_provider_connections')
        .select('tutor_id, connection_status')
        .eq('connection_status', 'connected');

      if (connectionsError) {
        console.error('❌ Error fetching video connections:', connectionsError);
      }

      const tutorsWithVideo = new Set(videoConnections?.map(c => c.tutor_id) || []);
      
      // Only show tutors with active video connections
      const activeTutorProfiles = tutorProfiles?.filter(t => tutorsWithVideo.has(t.id)) || [];
      
      console.log(`✅ Showing ${activeTutorProfiles.length} tutors with video connections`);
      console.log('Active tutor profiles:', activeTutorProfiles.slice(0, 5).map(t => ({ id: t.id, name: t.full_name || t.username })));

      // Ratings summary (server-side, bypasses RLS). This ensures review counts show correctly.
      const ratingsSummaryRes = await fetch('/api/public/tutors/ratings-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorIds: activeTutorProfiles.map(t => t.id) }),
      });
      const ratingsSummaryJson = await ratingsSummaryRes.json().catch(() => ({}));
      const ratingsByTutorId = (ratingsSummaryJson?.byTutorId || {}) as Record<
        string,
        { ratingCount: number; averageRating: number | null }
      >;

      // Fetch tutor subjects separately
      const { data: tutorSubjects, error: subjectsError } = await supabase
        .from('tutor_subjects')
        .select('tutor_id, price_per_hour_ttd, subject_id');

      if (subjectsError) {
        console.error('❌ Error fetching tutor subjects:', subjectsError);
        alert(`Error loading tutor subjects: ${subjectsError.message}`);
        throw subjectsError;
      }
      
      console.log('✅ Fetched tutor subjects:', tutorSubjects?.length || 0);

      // Fetch all subjects separately
      const { data: allSubjectsData, error: allSubjectsError } = await supabase
        .from('subjects')
        .select('id, name, label, curriculum, level');

      if (allSubjectsError) {
        console.error('Error fetching subjects:', allSubjectsError);
        throw allSubjectsError;
      }
      
      console.log('Fetched subjects:', allSubjectsData?.length || 0);

      // Create a map for quick subject lookup
      const subjectsMap = new Map(allSubjectsData.map(s => [s.id, s]));

      // Process data - manually join tutor_subjects with subjects
      const tutorsWithData: Tutor[] = activeTutorProfiles.map(tutor => {
        const subjects = tutorSubjects
          .filter(ts => ts.tutor_id === tutor.id)
          .map(ts => {
            const subject = subjectsMap.get(ts.subject_id);
            if (!subject) {
              console.warn(`Subject not found for id: ${ts.subject_id}`);
              return null;
            }
            
            return {
              id: subject.id,
              name: subject.label || subject.name, // Use label for display
              curriculum: subject.curriculum || subject.level || '', // Try curriculum first, then level
              level: subject.level || '',
              price_per_hour_ttd: paidClassesEnabled ? ts.price_per_hour_ttd : 0
            };
          })
          .filter((s): s is NonNullable<typeof s> => s !== null);
        
        console.log(`Tutor ${tutor.username || tutor.full_name}: ${subjects.length} subjects`);

        const summary = ratingsByTutorId[tutor.id];
        const count = Number(summary?.ratingCount || 0);
        const avgRating = count > 0 && summary?.averageRating != null ? Number(summary.averageRating) : null;

        return {
          ...tutor,
          subjects,
          average_rating: avgRating,
          total_reviews: count,
          topComment: null
        };
      });

      // Filter out tutors with no subjects
      const tutorsWithSubjects = tutorsWithData.filter(t => t.subjects.length > 0);

      console.log('=== TUTOR LOADING SUMMARY ===');
      console.log('Total tutor profiles:', activeTutorProfiles?.length || 0);
      console.log('Tutors with data (before subject filter):', tutorsWithData.length);
      console.log('Tutors without subjects:', tutorsWithData.filter(t => t.subjects.length === 0).map(t => ({ name: t.full_name || t.username, id: t.id })));
      console.log('Tutors with subjects:', tutorsWithSubjects.length);
      console.log('Tutors:', tutorsWithSubjects.map(t => ({
        name: t.display_name || t.username || t.full_name,
        username: t.username,
        subjectCount: t.subjects.length
      })));

      // Extract unique schools for filter
      const schools = [...new Set(tutorsWithSubjects.map(t => t.school).filter(Boolean))] as string[];
      setAvailableSchools(schools.sort());

      setTutors(tutorsWithSubjects);
    } catch (error) {
      console.error('Error fetching tutors:', error);
    } finally {
      setLoadingTutors(false);
    }
  }

  const filteredTutors = useMemo(() => {
    let filtered = [...tutors];

    // Search by name (display name, username, or full name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(tutor => {
        const displayName = getDisplayName(tutor).toLowerCase();
        const username = tutor.username?.toLowerCase() || '';
        const fullName = tutor.full_name?.toLowerCase() || '';
        
        return displayName.includes(query) || 
               username.includes(query) || 
               fullName.includes(query);
      });
    }

    // Filter by subject
    if (selectedSubjects.length > 0) {
      filtered = filtered.filter(tutor =>
        tutor.subjects.some(s => selectedSubjects.includes(s.name))
      );
    }

    // Filter by rating
    if (selectedRating) {
      const minRating = parseFloat(selectedRating);
      filtered = filtered.filter(tutor =>
        tutor.average_rating !== null && tutor.average_rating >= minRating
      );
    }

    // Filter by price
    if (selectedPrice) {
      if (selectedPrice === 'free') {
        // Only show tutors with at least one free subject
        filtered = filtered.filter(tutor =>
          tutor.subjects.some(s => s.price_per_hour_ttd === 0)
        );
      } else {
        const maxPrice = parseFloat(selectedPrice);
        filtered = filtered.filter(tutor =>
          tutor.subjects.some(s => s.price_per_hour_ttd <= maxPrice)
        );
      }
    }

    // Filter by school
    if (selectedSchool) {
      filtered = filtered.filter(tutor => tutor.school === selectedSchool);
    }

    // Sort: Prioritize tutors who teach student's subjects, then by rating
    if (profile?.subjects_of_study && profile.subjects_of_study.length > 0) {
      filtered.sort((a, b) => {
        const aMatchesSubjects = a.subjects.some(s =>
          profile.subjects_of_study?.includes(s.name)
        );
        const bMatchesSubjects = b.subjects.some(s =>
          profile.subjects_of_study?.includes(s.name)
        );

        if (aMatchesSubjects && !bMatchesSubjects) return -1;
        if (!aMatchesSubjects && bMatchesSubjects) return 1;

        // If both match or both don't match, sort by rating
        const aRating = a.average_rating || 0;
        const bRating = b.average_rating || 0;
        return bRating - aRating;
      });
    } else {
      // Just sort by rating if no student subjects
      filtered.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
    }

    return filtered;
  }, [tutors, searchQuery, selectedSubjects, selectedRating, selectedPrice, selectedSchool, profile]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  return (
    <DashboardLayout role="student" userName={getDisplayName(profile)}>
      <div className="px-4 py-3 sm:px-0">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Find an iTutor</h1>
          <p className="text-gray-600">Search for tutors and book your sessions</p>
        </div>

        {/* Search and Filters */}
        <div className="bg-white border-2 border-gray-200 rounded-xl p-4 mb-4 shadow-md">
          {/* Search Bar */}
          <div className="mb-3">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tutors by name..."
                className="w-full px-3 py-2 pl-10 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition text-sm"
              />
              <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Filters */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${paidClassesEnabled ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Subjects
              </label>
              <SubjectMultiSelect
                selectedSubjects={selectedSubjects}
                onChange={setSelectedSubjects}
                placeholder="Select subjects..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                School
              </label>
              <select
                value={selectedSchool}
                onChange={(e) => setSelectedSchool(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition text-sm"
              >
                <option value="">Any School</option>
                {availableSchools.map(school => (
                  <option key={school} value={school}>{school}</option>
                ))}
              </select>
            </div>

            {/* Price Range filter - only show if paid classes enabled */}
            {paidClassesEnabled && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Price Range
                </label>
                <select
                  value={selectedPrice}
                  onChange={(e) => setSelectedPrice(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition text-sm"
                >
                  <option value="">Any Price</option>
                  <option value="free">Free Sessions</option>
                  <option value="50">Up to $50</option>
                  <option value="100">Up to $100</option>
                  <option value="150">Up to $150</option>
                  <option value="200">Up to $200</option>
                  <option value="300">Up to $300</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Rating
              </label>
              <select
                value={selectedRating}
                onChange={(e) => setSelectedRating(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition text-sm"
              >
                <option value="">Any Rating</option>
                <option value="4.5">4.5+ Stars</option>
                <option value="4.0">4.0+ Stars</option>
                <option value="3.5">3.5+ Stars</option>
                <option value="3.0">3.0+ Stars</option>
              </select>
            </div>

            {/* Clear Filters Button (aligned in grid) */}
            <div className="flex items-end">
              {(searchQuery || selectedSubjects.length > 0 || selectedRating || selectedPrice || selectedSchool) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedSubjects([]);
                    setSelectedRating('');
                    setSelectedPrice('');
                    setSelectedSchool('');
                  }}
                  className="w-full px-3 py-2 text-sm text-itutor-green hover:text-emerald-400 font-medium transition-colors border border-itutor-green/30 rounded-lg hover:border-itutor-green/60"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-3">
          <p className="text-gray-600 text-sm">
            Showing {filteredTutors.length} {filteredTutors.length === 1 ? 'tutor' : 'tutors'}
          </p>
        </div>

        {/* Tutors Grid */}
        {loadingTutors ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading tutors...</p>
          </div>
        ) : filteredTutors.length === 0 ? (
          <div className="text-center py-12 bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-2xl">
            <div className="bg-white rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 shadow-sm">
              <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-gray-700 mb-2 font-medium">No iTutors Yet</p>
            <p className="text-sm text-gray-500">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTutors.map(tutor => {
              const matchesStudentSubjects = profile.subjects_of_study?.some(studentSubject =>
                tutor.subjects.some(tutorSubject => tutorSubject.name === studentSubject)
              );

              return (
                <div
                  key={tutor.id}
                  className="bg-white border-2 border-gray-200 rounded-2xl p-6 hover:shadow-xl hover:border-gray-300 transition-all duration-300 hover:scale-105"
                >
                  {/* Recommended Badge - Only for verified tutors */}
                  {matchesStudentSubjects && tutor.tutor_verification_status === 'VERIFIED' && (
                    <div className="mb-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-itutor-green to-emerald-600 text-white">
                        ⭐ Recommended
                      </span>
                    </div>
                  )}

                  {/* Tutor Info */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${getAvatarColor(tutor.id)} flex items-center justify-center text-white font-bold text-xl flex-shrink-0`}>
                      {tutor.avatar_url ? (
                        <img src={tutor.avatar_url} alt={getDisplayName(tutor)} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        getDisplayName(tutor).charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-gray-900 truncate flex items-center gap-2">
                        {getDisplayName(tutor)}
                        {tutor.tutor_verification_status === 'VERIFIED' && <VerifiedBadge size="sm" />}
                      </h3>
                      {tutor.username && (
                        <p className="text-xs text-gray-500 truncate">@{tutor.username}</p>
                      )}
                      {tutor.school && (
                        <p className="text-sm text-gray-600 truncate">{tutor.school}</p>
                      )}
                      {/* Always show rating */}
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-yellow-400 text-base">★</span>
                        {tutor.average_rating !== null ? (
                          <>
                            <span className="text-sm font-bold text-gray-900">
                              {tutor.average_rating.toFixed(1)}
                            </span>
                            <span className="text-xs text-gray-600">
                              ({tutor.total_reviews} {tutor.total_reviews === 1 ? 'review' : 'reviews'})
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-gray-500 italic">No reviews yet</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bio */}
                  {tutor.bio && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-700 line-clamp-2">
                        {tutor.bio}
                      </p>
                    </div>
                  )}

                  {/* Top Comment */}
                  {tutor.topComment && (
                    <div className="mb-4 bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center gap-1 mb-1">
                        {[...Array(tutor.topComment.stars)].map((_, i) => (
                          <span key={i} className="text-yellow-400 text-sm">★</span>
                        ))}
                        <span className="text-xs text-gray-500 ml-1">• {tutor.topComment.student_name}</span>
                      </div>
                      <p className="text-xs text-gray-700 italic line-clamp-2">
                        "{tutor.topComment.comment}"
                      </p>
                    </div>
                  )}

                  {/* Subjects */}
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-2 font-medium">Teaches:</p>
                    <div className="flex flex-wrap gap-1">
                      {tutor.subjects.slice(0, 3).map(subject => (
                        <span
                          key={subject.id}
                          className="text-xs px-2 py-1 rounded bg-white border border-gray-300 text-gray-700"
                        >
                          {subject.name}
                        </span>
                      ))}
                      {tutor.subjects.length > 3 && (
                        <span className="text-xs px-2 py-1 rounded bg-blue-100 border border-blue-300 text-blue-700 font-medium">
                          +{tutor.subjects.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Price Range - only show if paid classes enabled and prices > 0 */}
                  {paidClassesEnabled && tutor.subjects.length > 0 && (
                    <p className="text-sm text-gray-600 mb-4">
                      From ${Math.min(...tutor.subjects.map(s => s.price_per_hour_ttd))}/hr
                    </p>
                  )}

                  {/* View Profile Button */}
                  <button
                    onClick={() => router.push(`/student/tutors/${tutor.id}`)}
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

