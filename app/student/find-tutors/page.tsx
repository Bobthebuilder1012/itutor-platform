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
import UserAvatar from '@/components/UserAvatar';
import { profileBannerDisplayUrl } from '@/lib/utils/profileBannerDisplayUrl';

const TEACHING_MODE_LABELS: Record<string, string> = {
  online: 'Online sessions',
  in_person: 'In-person sessions',
  both: 'Online & in-person',
};

const TUTOR_TYPE_LABELS: Record<string, string> = {
  professional_teacher: 'Professional teacher',
  university_tutor: 'University tutor',
  graduate_tutor: 'Graduate tutor',
};

type Tutor = {
  id: string;
  full_name: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_banner_url?: string | null;
  updated_at?: string;
  school?: string | null;
  institution_id?: string | null;
  institution_name?: string | null;
  country?: string | null;
  teaching_mode?: string | null;
  tutor_type?: string | null;
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
  const [currentPage, setCurrentPage] = useState(1);
  const TUTORS_PER_PAGE = 9;

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
      
      const selectWithBanner =
        'id, full_name, username, display_name, avatar_url, profile_banner_url, updated_at, institution_id, country, bio, tutor_verification_status, teaching_mode, tutor_type';
      const selectWithoutBanner =
        'id, full_name, username, display_name, avatar_url, updated_at, institution_id, country, bio, tutor_verification_status, teaching_mode, tutor_type';

      let tutorProfilesRes = await supabase
        .from('profiles')
        .select(selectWithBanner)
        .eq('role', 'tutor')
        .order('tutor_verification_status', { ascending: false });

      if (tutorProfilesRes.error) {
        tutorProfilesRes = await supabase
          .from('profiles')
          .select(selectWithoutBanner)
          .eq('role', 'tutor')
          .order('tutor_verification_status', { ascending: false });
      }

      const { data: tutorProfiles, error: profilesError } = tutorProfilesRes;

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

  // Reset to page 1 whenever filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedSubjects, selectedRating, selectedPrice, selectedSchool]);

  const totalPages = Math.ceil(filteredTutors.length / TUTORS_PER_PAGE);
  const pagedTutors = filteredTutors.slice(
    (currentPage - 1) * TUTORS_PER_PAGE,
    currentPage * TUTORS_PER_PAGE
  );

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  const hasActiveFilters = searchQuery || selectedSubjects.length > 0 || selectedRating || selectedPrice || selectedSchool;

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedSubjects([]);
    setSelectedRating('');
    setSelectedPrice('');
    setSelectedSchool('');
  };

  const quickSubjects = ['CSEC Mathematics', 'CSEC English A', 'CSEC Biology', 'CSEC Chemistry', 'CAPE Physics', 'SEA Mathematics'];

  return (
    <DashboardLayout role="student" userName={getDisplayName(profile)}>
      <div className="px-1 py-2 sm:px-0">

        {/* ── HERO HEADER ── */}
        <div className="mb-5">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-itutor-green mb-1">Discover</p>
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Find an iTutor</h1>
            <span className="inline-flex items-center gap-1.5 bg-itutor-green text-black text-sm font-bold px-3 py-1 rounded-full">
              <span className="text-base font-extrabold">100+</span> tutors available
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">Search and book from verified tutors across Trinidad &amp; Tobago</p>
        </div>

        {/* ── FILTER PANEL ── */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm mb-5 overflow-hidden">

          {/* Search row */}
          <div className="px-5 pt-5 pb-4 border-b border-gray-100">
            <div className="relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tutors by name or username..."
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none focus:bg-white transition text-sm"
              />
            </div>
          </div>

          {/* Filter dropdowns */}
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Subjects</p>
              <SubjectMultiSelect
                selectedSubjects={selectedSubjects}
                onChange={setSelectedSubjects}
                placeholder="Select subjects..."
              />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">School / Institution</p>
              <select
                value={selectedSchool}
                onChange={(e) => setSelectedSchool(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition text-sm"
              >
                <option value="">All Schools</option>
                {institutions.map(inst => (
                  <option key={inst.id} value={inst.id}>{inst.name}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Price Range</p>
              <select
                value={selectedPrice}
                onChange={(e) => setSelectedPrice(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition text-sm"
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
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Rating</p>
              <select
                value={selectedRating}
                onChange={(e) => setSelectedRating(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition text-sm"
              >
                <option value="">Any Rating</option>
                <option value="4.5">4.5+ Stars</option>
                <option value="4.0">4.0+ Stars</option>
                <option value="3.5">3.5+ Stars</option>
                <option value="3.0">3.0+ Stars</option>
              </select>
            </div>
          </div>

          {/* Quick chips + clear */}
          <div className="px-5 pb-4 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-1">Quick:</span>
            {quickSubjects.map(subj => (
              <button
                key={subj}
                onClick={() => setSelectedSubjects(prev =>
                  prev.includes(subj) ? prev.filter(s => s !== subj) : [...prev, subj]
                )}
                className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                  selectedSubjects.includes(subj)
                    ? 'bg-itutor-green text-black border-itutor-green'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-itutor-green hover:text-itutor-green'
                }`}
              >
                {subj}
              </button>
            ))}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto text-xs px-3 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors font-medium flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Results count */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing <span className="font-semibold text-gray-900">{filteredTutors.length}</span> {filteredTutors.length === 1 ? 'tutor' : 'tutors'}
            {totalPages > 1 && <span> — page <span className="font-semibold text-gray-900">{currentPage}</span> of {totalPages}</span>}
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 items-stretch">
            {pagedTutors.map(tutor => {
              const matchesStudentSubjects = profile.subjects_of_study?.some(studentSubject =>
                tutor.subjects.some(tutorSubject => tutorSubject.name === studentSubject)
              );
              const bannerGradient = getAvatarColor(tutor.id);
              const teachingLabel = tutor.teaching_mode
                ? TEACHING_MODE_LABELS[tutor.teaching_mode] ?? null
                : null;
              const typeLabel = tutor.tutor_type ? TUTOR_TYPE_LABELS[tutor.tutor_type] ?? null : null;

              return (
                <article
                  key={tutor.id}
                  className="group flex h-full min-h-[28rem] flex-col overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-sm transition-all duration-300 hover:border-itutor-green hover:shadow-xl"
                >
                  <div className="relative h-36 shrink-0 sm:h-40">
                    {tutor.profile_banner_url ? (
                      <img
                        src={profileBannerDisplayUrl(tutor.profile_banner_url, tutor.updated_at)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className={`h-full w-full bg-gradient-to-br ${bannerGradient}`}
                        aria-hidden
                      />
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent" />
                    <div className="absolute left-4 top-4 right-4 flex flex-wrap items-start justify-end gap-2">
                      {matchesStudentSubjects && tutor.tutor_verification_status === 'VERIFIED' && (
                        <span className="inline-flex items-center rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 shadow-sm ring-1 ring-emerald-200/80 backdrop-blur-sm">
                          ✓ Matches your subjects
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="relative flex flex-1 flex-col px-6 pb-6 pt-5">
                    <div className="mb-4 flex items-start gap-4">
                      <div className="relative -mt-14 shrink-0 rounded-full ring-4 ring-white shadow-md sm:-mt-16">
                        <UserAvatar avatarUrl={tutor.avatar_url} name={getDisplayName(tutor)} size={88} />
                      </div>
                      <div className="min-w-0 flex-1 pt-1">
                        <div className="flex items-start gap-2">
                          <h3 className="line-clamp-2 flex-1 text-lg font-bold leading-tight text-gray-900">
                            {getDisplayName(tutor)}
                          </h3>
                          {tutor.tutor_verification_status === 'VERIFIED' && (
                            <VerifiedBadge size="sm" />
                          )}
                        </div>
                        {tutor.username && (
                          <p className="truncate text-xs text-gray-500">@{tutor.username}</p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-600">
                          <span className="flex items-center gap-0.5">
                            <span className="text-yellow-400">★</span>
                            {tutor.average_rating !== null ? (
                              <>
                                <span className="font-bold text-gray-900">{tutor.average_rating.toFixed(1)}</span>
                                <span className="text-xs text-gray-500">
                                  ({tutor.total_reviews} {tutor.total_reviews === 1 ? 'review' : 'reviews'})
                                </span>
                              </>
                            ) : (
                              <span className="text-xs italic text-gray-500">No reviews yet</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4 min-h-[2.75rem] space-y-1.5 border-b border-gray-100 pb-4 text-sm text-gray-600">
                      {tutor.institution_name && (
                        <p className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0 text-gray-400" aria-hidden>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                          </span>
                          <span className="line-clamp-2 font-medium text-gray-800">{tutor.institution_name}</span>
                        </p>
                      )}
                      {tutor.country && (
                        <p className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="shrink-0 text-gray-400" aria-hidden>
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </span>
                          {tutor.country}
                        </p>
                      )}
                      {(teachingLabel || typeLabel) && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {typeLabel && (
                            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                              {typeLabel}
                            </span>
                          )}
                          {teachingLabel && (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-100">
                              {teachingLabel}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {tutor.bio && (
                      <div className="mb-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">About</p>
                        <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-gray-700">{tutor.bio}</p>
                      </div>
                    )}

                    {tutor.topComment && (
                      <div className="mb-4 rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/80 to-white p-3">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800/80">Featured review</p>
                        <div className="mb-1 flex items-center gap-0.5">
                          {[...Array(tutor.topComment.stars)].map((_, i) => (
                            <span key={i} className="text-sm text-yellow-400">★</span>
                          ))}
                          <span className="ml-1 text-xs text-gray-500">· {tutor.topComment.student_name}</span>
                        </div>
                        <p className="line-clamp-2 text-xs italic text-gray-700">"{tutor.topComment.comment}"</p>
                      </div>
                    )}

                    <div className="mb-4 flex-1">
                      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Teaches</p>
                      <div className="flex flex-wrap gap-1.5">
                        {tutor.subjects.slice(0, 5).map(subject => (
                          <span
                            key={subject.id}
                            className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-800"
                          >
                            {subject.name}
                          </span>
                        ))}
                        {tutor.subjects.length > 5 && (
                          <span className="rounded-md border border-gray-200 bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                            +{tutor.subjects.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-auto space-y-3 border-t border-gray-100 pt-4">
                      {tutor.subjects.length > 0 && (
                        <p className="text-sm font-semibold text-gray-900">
                          {process.env.NEXT_PUBLIC_ENABLE_PAID_SESSIONS === 'true'
                            ? `From $${Math.min(...tutor.subjects.map(s => s.price_per_hour_ttd))}/hr`
                            : '$0.00/hr'}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => router.push(`/student/tutors/${tutor.id}`)}
                        className="w-full rounded-xl bg-gradient-to-r from-itutor-green to-emerald-600 py-3 px-4 font-semibold text-white shadow-lg transition-all duration-300 hover:from-emerald-600 hover:to-itutor-green hover:shadow-itutor-green/40"
                      >
                        View Profile
                      </button>
                    </div>
                  </div>
                </article>
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

