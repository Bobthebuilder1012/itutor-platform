'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import { getDisplayName } from '@/lib/utils/displayName';
import { getAvatarColor } from '@/lib/utils/avatarColors';
import VerifiedBadge from '@/components/VerifiedBadge';

type Tutor = {
  id: string;
  full_name: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  school?: string | null;
  institution_id?: string | null;
  institution_name?: string | null;
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
  topComment: {
    comment: string;
    stars: number;
    student_name: string;
  } | null;
};

type Institution = {
  id: string;
  name: string;
};

export default function FindTutorsPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loadingTutors, setLoadingTutors] = useState(true);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedRating, setSelectedRating] = useState<string>('');
  const [selectedPrice, setSelectedPrice] = useState<string>('');
  const [selectedSchool, setSelectedSchool] = useState<string>('');

  useEffect(() => {
    if (loading) return;
    
    if (!profile || profile.role !== 'student') {
      router.push('/login');
      return;
    }

    fetchTutors();
  }, [profile, loading, router]);

  async function fetchTutors() {
    setLoadingTutors(true);
    try {
      console.log('=== STARTING TUTOR FETCH ===');
      
      // Fetch all institutions for the filter dropdown
      let institutionsData: Institution[] = [];
      try {
        const { data, error: institutionsError } = await supabase
          .from('institutions')
          .select('id, name')
          .order('name');

        if (institutionsError) {
          console.error('❌ Error fetching institutions:', institutionsError);
        } else {
          institutionsData = data || [];
          setInstitutions(institutionsData);
          console.log('✅ Fetched institutions:', institutionsData.length);
        }
      } catch (err) {
        console.error('❌ Exception fetching institutions:', err);
      }
      
      // Fetch all tutor profiles with bio
      const { data: tutorProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, username, display_name, avatar_url, institution_id, country, bio, tutor_verification_status')
        .eq('role', 'tutor')
        .order('tutor_verification_status', { ascending: false, nullsFirst: false }); // Verified tutors first

      if (profilesError) {
        console.error('❌ Error fetching tutor profiles:', profilesError);
        alert(`Error loading tutors: ${profilesError.message}`);
        throw profilesError;
      }
      
      console.log('✅ Fetched tutor profiles:', tutorProfiles?.length || 0);
      console.log('Tutor profiles data:', tutorProfiles);

      // TEMPORARILY DISABLED: Filter out tutors without video provider connections
      // TODO: Re-enable once tutors have connected their video providers
      // const { data: videoConnections, error: connectionsError } = await supabase
      //   .from('tutor_video_provider_connections')
      //   .select('tutor_id')
      //   .eq('connection_status', 'connected');

      // if (connectionsError) {
      //   console.error('❌ Error fetching video connections:', connectionsError);
      // }

      // const tutorsWithVideo = new Set(videoConnections?.map(c => c.tutor_id) || []);
      // const activeTutorProfiles = tutorProfiles?.filter(t => tutorsWithVideo.has(t.id)) || [];
      
      const activeTutorProfiles = tutorProfiles || []; // Show all tutors for now
      
      console.log(`✅ Showing ${activeTutorProfiles.length} tutors (video provider filter disabled)`);

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
      
      // Create a map for quick institution lookup
      const institutionsMap = new Map<string, string>();
      institutionsData.forEach(inst => {
        institutionsMap.set(inst.id, inst.name);
      });

      // Fetch all ratings for averages
      const { data: allRatings, error: allRatingsError } = await supabase
        .from('ratings')
        .select('tutor_id, stars');

      if (allRatingsError) throw allRatingsError;

      // Fetch ratings with comments for top comment display (sorted by popularity)
      const { data: ratingsWithComments, error: commentsError } = await supabase
        .from('ratings')
        .select(`
          tutor_id, 
          stars, 
          comment,
          helpful_count,
          student:student_id (
            display_name,
            full_name,
            username
          )
        `)
        .not('comment', 'is', null)
        .order('helpful_count', { ascending: false, nullsFirst: false })
        .order('stars', { ascending: false });

      if (commentsError) throw commentsError;

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
              price_per_hour_ttd: ts.price_per_hour_ttd
            };
          })
          .filter((s): s is NonNullable<typeof s> => s !== null);
        
        console.log(`Tutor ${tutor.username || tutor.full_name}: ${subjects.length} subjects`);

        const tutorRatings = allRatings.filter(r => r.tutor_id === tutor.id);
        const avgRating = tutorRatings.length > 0
          ? tutorRatings.reduce((sum, r) => sum + r.stars, 0) / tutorRatings.length
          : null;

        // Find top comment (highest stars, prefer 5 stars)
        const tutorComments = ratingsWithComments.filter(r => r.tutor_id === tutor.id);
        const topComment = tutorComments.length > 0 ? tutorComments[0] : null;

        return {
          ...tutor,
          institution_name: tutor.institution_id ? institutionsMap.get(tutor.institution_id) : null,
          subjects,
          average_rating: avgRating,
          total_reviews: tutorRatings.length,
          topComment: topComment ? {
            comment: topComment.comment,
            stars: topComment.stars,
            student_name: (topComment.student as any)?.display_name || (topComment.student as any)?.full_name || (topComment.student as any)?.username || 'Anonymous'
          } : null
        };
      });

      // Filter out tutors with no subjects
      const tutorsWithSubjects = tutorsWithData.filter(t => t.subjects.length > 0);

      console.log('=== TUTOR LOADING SUMMARY ===');
      console.log('Total tutor profiles:', activeTutorProfiles?.length || 0);
      console.log('Tutors with subjects:', tutorsWithSubjects.length);

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

    // Filter by school/institution
    if (selectedSchool) {
      filtered = filtered.filter(tutor =>
        tutor.institution_id === selectedSchool
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
                School/Institution
              </label>
              <select
                value={selectedSchool}
                onChange={(e) => setSelectedSchool(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition text-sm"
              >
                <option value="">All Schools</option>
                {institutions.map(institution => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name}
                  </option>
                ))}
              </select>
            </div>

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
          <div className="text-center py-12 bg-white border-2 border-gray-200 rounded-2xl shadow-md">
            <div className="bg-gray-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-gray-600 mb-2">No iTutors found</p>
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
                  className="bg-white border-2 border-gray-200 rounded-2xl p-6 hover:shadow-xl hover:border-itutor-green transition-all duration-300 hover:scale-105"
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
                      {tutor.institution_name && (
                        <p className="text-sm text-gray-600 truncate">{tutor.institution_name}</p>
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
                    <div className="mb-4 bg-white/70 rounded-lg p-3 border border-green-200">
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
                        <span className="text-xs px-2 py-1 rounded bg-white border border-gray-300 text-gray-700">
                          +{tutor.subjects.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Price Range */}
                  {tutor.subjects.length > 0 && (
                    <p className="text-sm text-gray-600 mb-4">
                      {process.env.NEXT_PUBLIC_ENABLE_PAID_SESSIONS === 'true' 
                        ? `From $${Math.min(...tutor.subjects.map(s => s.price_per_hour_ttd))}/hr`
                        : 'FREE sessions'}
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

