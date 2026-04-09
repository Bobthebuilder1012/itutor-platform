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
  const [filtersOpen, setFiltersOpen] = useState(false);
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
      
      const tutorSelectTiers = [
        'id, full_name, username, display_name, avatar_url, profile_banner_url, updated_at, institution_id, country, bio, tutor_verification_status, teaching_mode, tutor_type',
        'id, full_name, username, display_name, avatar_url, updated_at, institution_id, country, bio, tutor_verification_status, teaching_mode, tutor_type',
        'id, full_name, username, display_name, avatar_url, country, bio, tutor_verification_status, teaching_mode, tutor_type',
        'id, full_name, username, display_name, avatar_url, country, bio, tutor_verification_status',
        'id, full_name, username, display_name, country, bio, tutor_verification_status',
        'id, full_name, country, bio, tutor_verification_status',
        'id, full_name, country, tutor_verification_status',
        'id, full_name',
      ];

      let tutorProfiles: Record<string, unknown>[] | null = null;
      let profilesError: { message: string; code?: string; details?: string } | null = null;
      for (const cols of tutorSelectTiers) {
        const res = await supabase.from('profiles').select(cols).eq('role', 'tutor');
        if (!res.error) {
          tutorProfiles = (res.data ?? []) as Record<string, unknown>[];
          profilesError = null;
          break;
        }
        profilesError = res.error;
        console.warn('find-tutors profiles select retry:', cols, res.error.message);
      }

      if (profilesError || !tutorProfiles) {
        console.error('❌ Error fetching tutor profiles:', JSON.stringify(profilesError));
        alert(`Error loading tutors: ${profilesError?.message ?? 'Unknown error'}`);
        throw profilesError ?? new Error('No tutor profiles');
      }

      const verificationRank: Record<string, number> = {
        VERIFIED: 0,
        PENDING: 1,
        PROCESSING: 2,
        UNVERIFIED: 3,
        REJECTED: 4,
      };
      tutorProfiles.sort(
        (a, b) =>
          (verificationRank[String(a.tutor_verification_status ?? 'UNVERIFIED')] ?? 9) -
          (verificationRank[String(b.tutor_verification_status ?? 'UNVERIFIED')] ?? 9)
      );

      const tutorProfilesWithBanners: Array<Record<string, unknown> & { id: string }> = tutorProfiles;

      console.log('✅ Fetched tutor profiles:', tutorProfilesWithBanners?.length || 0);
      console.log('Tutor profiles data:', tutorProfilesWithBanners);

      const activeTutorProfiles = tutorProfilesWithBanners;
      const activeTutorIds = activeTutorProfiles.map((t) => t.id);

      console.log(`✅ Showing ${activeTutorProfiles.length} tutors (video provider filter disabled)`);

      // Fetch subjects for all tutor profiles
      const { data: tutorSubjects, error: subjectsError } =
        activeTutorIds.length > 0
          ? await supabase
              .from('tutor_subjects')
              .select('tutor_id, price_per_hour_ttd, subject_id')
              .in('tutor_id', activeTutorIds)
          : { data: [], error: null };

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
      const subjectsMap = new Map(allSubjectsData.map((s) => [s.id, s]));

      // Create a map for quick institution lookup
      const institutionsMap = new Map<string, string>();
      institutionsData.forEach((inst) => {
        institutionsMap.set(inst.id, inst.name);
      });

      // Fetch ratings only for these tutors
      const ratingsQuery =
        activeTutorIds.length > 0
          ? supabase.from('ratings').select('tutor_id, stars').in('tutor_id', activeTutorIds)
          : Promise.resolve({ data: [] as { tutor_id: string; stars: number }[], error: null });

      const commentsQuery =
        activeTutorIds.length > 0
          ? supabase
              .from('ratings')
              .select(
                `tutor_id, stars, comment, helpful_count, student:student_id (display_name, full_name, username)`
              )
              .in('tutor_id', activeTutorIds)
              .not('comment', 'is', null)
              .order('helpful_count', { ascending: false })
              .order('stars', { ascending: false })
          : Promise.resolve({ data: [] as any[], error: null });

      const [{ data: allRatings, error: allRatingsError }, { data: ratingsWithComments, error: commentsError }] =
        await Promise.all([ratingsQuery, commentsQuery]);

      if (allRatingsError) throw allRatingsError;
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

      // Only require at least one subject to be listed
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

          {/* Search + toggle row */}
          <div className="px-4 py-3 flex items-center gap-2">
            <div className="relative flex-1">
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

            {/* Active filter count badge */}
            {hasActiveFilters && (
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-itutor-green text-white text-[10px] font-bold flex items-center justify-center">
                {[selectedSubjects.length > 0, selectedSchool, selectedPrice, selectedRating].filter(Boolean).length}
              </span>
            )}

            {/* Filter toggle */}
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                filtersOpen
                  ? 'bg-itutor-green/10 border-itutor-green text-itutor-green'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/>
              </svg>
              <span className="hidden sm:inline">Filters</span>
              <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
              </svg>
            </button>

            {/* Search button */}
            <button className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-itutor-green text-white text-sm font-semibold hover:bg-emerald-700 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <span className="hidden sm:inline">Search</span>
            </button>
          </div>

          {/* Expandable filters */}
          {filtersOpen && (
            <>
              <div className="px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-gray-100">
                {/* Subjects */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Subjects</p>
                  <SubjectMultiSelect selectedSubjects={selectedSubjects} onChange={setSelectedSubjects} placeholder="Type a subject..." />
                </div>

                {/* School */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">School / Institution</p>
                  <div className="relative">
                    <select value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition text-sm appearance-none pr-8">
                      <option value="">All schools</option>
                      {institutions.map(inst => <option key={inst.id} value={inst.id}>{inst.name}</option>)}
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                  </div>
                </div>

                {/* Price */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Price Range</p>
                  <div className="relative">
                    <select value={selectedPrice} onChange={(e) => setSelectedPrice(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition text-sm appearance-none pr-8">
                      <option value="">Any price</option>
                      <option value="free">Free Sessions</option>
                      <option value="50">Up to $50</option>
                      <option value="100">Up to $100</option>
                      <option value="150">Up to $150</option>
                      <option value="200">Up to $200</option>
                      <option value="300">Up to $300</option>
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                  </div>
                </div>

                {/* Rating */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Rating</p>
                  <div className="relative">
                    <select value={selectedRating} onChange={(e) => setSelectedRating(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition text-sm appearance-none pr-8">
                      <option value="">Any rating</option>
                      <option value="4.5">4.5+ Stars</option>
                      <option value="4.0">4.0+ Stars</option>
                      <option value="3.5">3.5+ Stars</option>
                      <option value="3.0">3.0+ Stars</option>
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                  </div>
                </div>
              </div>

              {/* Quick chips */}
              <div className="px-4 pb-3 flex items-center gap-2 flex-wrap border-t border-gray-100 pt-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-1">Quick</span>
                {quickSubjects.map(subj => (
                  <button key={subj}
                    onClick={() => setSelectedSubjects(prev => prev.includes(subj) ? prev.filter(s => s !== subj) : [...prev, subj])}
                    className={`text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all ${
                      selectedSubjects.includes(subj)
                        ? 'bg-itutor-green/10 text-itutor-green border-itutor-green'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-itutor-green hover:text-itutor-green'
                    }`}>
                    {selectedSubjects.includes(subj) && <span className="mr-1">•</span>}{subj}
                  </button>
                ))}
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="ml-auto text-xs px-3 py-1.5 rounded-full border border-red-200 text-red-400 hover:bg-red-50 transition font-medium">
                    Clear all
                  </button>
                )}
              </div>
            </>
          )}

          {/* Results bar */}
          <div className={`px-4 py-2.5 flex items-center justify-between ${filtersOpen ? 'border-t border-gray-100' : ''}`}>
            <p className="text-sm font-semibold text-itutor-green">
              {filteredTutors.length >= 100 ? '100+' : filteredTutors.length} iTutors Found
              {totalPages > 1 && <span className="text-gray-400 font-normal ml-2 text-xs">page {currentPage} of {totalPages}</span>}
            </p>
            {hasActiveFilters && !filtersOpen && (
              <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-red-400 transition font-medium">Clear filters</button>
            )}
          </div>
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
            {pagedTutors.map(tutor => {
              const matchesStudentSubjects = profile.subjects_of_study?.some(studentSubject =>
                tutor.subjects.some(tutorSubject => tutorSubject.name === studentSubject)
              );

              return (
                <div
                  key={tutor.id}
                  className="bg-white border-2 border-gray-200 rounded-2xl overflow-hidden hover:shadow-xl hover:border-itutor-green transition-all duration-300 flex flex-col"
                >
                  <div className="relative h-28 shrink-0 sm:h-32">
                    {tutor.profile_banner_url ? (
                      <img
                        src={profileBannerDisplayUrl(tutor.profile_banner_url, tutor.updated_at)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className={`h-full w-full bg-gradient-to-br ${getAvatarColor(tutor.id)}`}
                        aria-hidden
                      />
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
                  </div>

                  <div className="p-6 flex flex-col flex-1">
                  {/* Verified Badge */}
                  {matchesStudentSubjects && tutor.tutor_verification_status === 'VERIFIED' && (
                    <div className="mb-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-itutor-green to-emerald-600 text-white">
                        ✓ Verified
                      </span>
                    </div>
                  )}

                  {/* Tutor Info */}
                  <div className="flex items-start gap-4 mb-4">
                    <UserAvatar avatarUrl={tutor.avatar_url} name={getDisplayName(tutor)} size={64} />
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
                  <div className="mb-4 flex-1">
                    <p className="text-xs text-gray-500 mb-2 font-medium">Teaches:</p>
                    <div className="flex flex-wrap gap-1">
                      {tutor.subjects.slice(0, 4).map(subject => (
                        <span
                          key={subject.id}
                          className="text-xs px-2 py-1 rounded bg-gray-50 border border-gray-300 text-gray-700"
                        >
                          {subject.name}
                        </span>
                      ))}
                      {tutor.subjects.length > 4 && (
                        <span className="text-xs px-2 py-1 rounded bg-gray-100 border border-gray-300 text-gray-700 font-medium">
                          +{tutor.subjects.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* View Profile Button */}
                  <div className="mt-auto pt-2">
                    <button
                      onClick={() => router.push(`/student/tutors/${tutor.id}`)}
                      className="w-full bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-2 px-4 rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-itutor-green/50"
                    >
                      View Profile
                    </button>
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

