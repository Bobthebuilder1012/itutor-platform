'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types/database';
import { getDisplayName } from '@/lib/utils/displayName';

type SearchBarProps = {
  userRole: 'student' | 'tutor' | 'parent';
  onResultClick: (profile: Profile) => void;
};

type ProfileWithRating = Profile & {
  average_rating?: number | null;
  total_reviews?: number;
};

type SearchMode = 'tutor' | 'subject';

export default function UniversalSearchBar({ userRole, onResultClick }: SearchBarProps) {
  const router = useRouter();
  const [searchMode, setSearchMode] = useState<SearchMode>('tutor');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileWithRating[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    minRating: 0,
    country: 'any',
    school: 'any',
    verifiedOnly: false
  });
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);
  const [availableSchools, setAvailableSchools] = useState<string[]>([]);

  // Determine target role
  const targetRole = userRole === 'student' || userRole === 'parent' ? 'tutor' : 'student';

  // Role-based placeholders
  const placeholder = searchMode === 'tutor'
    ? (targetRole === 'tutor' ? "Search iTutors by name or username" : "Search students by name or username")
    : "Search by subject (e.g., Math, Biology, Chemistry)";

  // Fetch filter options on mount
  useEffect(() => {
    fetchFilterOptions();
  }, []);

  async function fetchFilterOptions() {
    try {
      // Get all tutors to extract unique countries and schools
      const { data: tutors } = await supabase
        .from('profiles')
        .select('country, school')
        .eq('role', targetRole);

      if (tutors) {
        const countries = new Set<string>();
        const schools = new Set<string>();
        tutors.forEach(t => {
          if (t.country) countries.add(t.country);
          if (t.school) schools.add(t.school);
        });
        setAvailableCountries(Array.from(countries).sort());
        setAvailableSchools(Array.from(schools).sort());
      }

      // Get all subjects from tutor_subjects table
      const { data: tutorSubjectsData } = await supabase
        .from('tutor_subjects')
        .select('subject_id');

      if (tutorSubjectsData) {
        const subjectIds = [...new Set(tutorSubjectsData.map(ts => ts.subject_id))];
        
        const { data: subjectsData } = await supabase
          .from('subjects')
          .select('id, name, label')
          .in('id', subjectIds);

        if (subjectsData) {
          const subjectNames = subjectsData.map(s => s.label || s.name).sort();
          setAvailableSubjects(subjectNames);
        }
      }
    } catch (err) {
      console.error('Error fetching filter options:', err);
    }
  }

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      performSearch();
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchMode, filters]);

  async function performSearch() {
    setLoading(true);
    try {
      let tutorIds: string[] = [];

      if (searchMode === 'subject') {
        // Search by subject - find tutors who teach this subject
        const { data: subjectsData } = await supabase
          .from('subjects')
          .select('id')
          .or(`name.ilike.%${query}%,label.ilike.%${query}%`);

        if (subjectsData && subjectsData.length > 0) {
          const subjectIds = subjectsData.map(s => s.id);
          
          const { data: tutorSubjectsData } = await supabase
            .from('tutor_subjects')
            .select('tutor_id')
            .in('subject_id', subjectIds);

          if (tutorSubjectsData) {
            tutorIds = [...new Set(tutorSubjectsData.map(ts => ts.tutor_id))];
          }
        }

        if (tutorIds.length === 0) {
          setResults([]);
          setLoading(false);
          return;
        }
      }

      // Build query
      let queryBuilder = supabase
        .from('profiles')
        .select('*')
        .eq('role', targetRole);

      if (searchMode === 'subject') {
        // Filter by tutors who teach the subject
        queryBuilder = queryBuilder.in('id', tutorIds);
      } else {
        // Search by name/username
        queryBuilder = queryBuilder.or(`display_name.ilike.%${query}%,full_name.ilike.%${query}%,username.ilike.%${query}%`);
      }

      // Apply filters
      if (filters.country !== 'any') {
        queryBuilder = queryBuilder.eq('country', filters.country);
      }
      if (filters.school !== 'any') {
        queryBuilder = queryBuilder.eq('school', filters.school);
      }

      if (filters.verifiedOnly && targetRole === 'tutor') {
        queryBuilder = queryBuilder.eq('tutor_verification_status', 'verified');
      }

      const { data, error } = await queryBuilder.limit(50);

      if (error) throw error;
      
      // If searching for tutors, fetch their ratings
      if (targetRole === 'tutor' && data && data.length > 0) {
        const tutorIdsForRatings = data.map(profile => profile.id);
        
        const { data: ratingsData } = await supabase
          .from('ratings')
          .select('tutor_id, stars')
          .in('tutor_id', tutorIdsForRatings);
        
        // Calculate average ratings
        const ratingsMap = new Map<string, { average: number; count: number }>();
        if (ratingsData) {
          ratingsData.forEach(rating => {
            const existing = ratingsMap.get(rating.tutor_id);
            if (existing) {
              existing.average = (existing.average * existing.count + rating.stars) / (existing.count + 1);
              existing.count += 1;
            } else {
              ratingsMap.set(rating.tutor_id, { average: rating.stars, count: 1 });
            }
          });
        }
        
        // Attach ratings to profiles
        let profilesWithRatings = data.map(profile => ({
          ...profile,
          average_rating: ratingsMap.get(profile.id)?.average || null,
          total_reviews: ratingsMap.get(profile.id)?.count || 0,
        }));

        // Filter by minimum rating
        if (filters.minRating > 0) {
          profilesWithRatings = profilesWithRatings.filter(
            p => p.average_rating !== null && p.average_rating >= filters.minRating
          );
        }

        // Sort: verified tutors first, then by rating
        profilesWithRatings.sort((a, b) => {
          // Verified tutors first
          const aVerified = a.tutor_verification_status === 'VERIFIED' ? 1 : 0;
          const bVerified = b.tutor_verification_status === 'VERIFIED' ? 1 : 0;
          if (aVerified !== bVerified) return bVerified - aVerified;

          // Then by rating
          const aRating = a.average_rating || 0;
          const bRating = b.average_rating || 0;
          return bRating - aRating;
        });
        
        setResults(profilesWithRatings);
      } else {
        setResults(data || []);
      }
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  // Close results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-search-container]')) {
        setResults([]);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubjectSearch = () => {
    if (query.length >= 2 && searchMode === 'subject') {
      // Route each user role to their correct search page
      const role = userRole === 'tutor' ? 'tutor' : userRole;
      router.push(`/${role}/search?subject=${encodeURIComponent(query)}&mode=subject`);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (searchMode === 'subject' && query.length >= 2) {
        handleSubjectSearch();
      }
    }
  };

  return (
    <div className="relative w-full mb-6" data-search-container>
      {/* Search Mode Toggle - Subtle version for students/parents */}
      {targetRole === 'tutor' && (
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => {
              setSearchMode('tutor');
              setQuery('');
              setResults([]);
            }}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
              searchMode === 'tutor'
                ? 'bg-itutor-green/20 text-itutor-green border border-itutor-green/30'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            By Name
          </button>
          <button
            onClick={() => {
              setSearchMode('subject');
              setQuery('');
              setResults([]);
            }}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
              searchMode === 'subject'
                ? 'bg-itutor-green/20 text-itutor-green border border-itutor-green/30'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            By Subject
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            className="w-full px-4 py-3 pl-11 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        {targetRole === 'tutor' && searchMode === 'subject' && results.length > 0 && (
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-3 bg-itutor-green border-2 border-itutor-green text-white font-semibold rounded-lg hover:bg-emerald-600 transition flex items-center gap-2`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
          </button>
        )}
      </div>

      {/* Filter Panel - Only show for subject search with results */}
      {targetRole === 'tutor' && searchMode === 'subject' && results.length > 0 && showFilters && (
        <div className="mt-3 p-4 bg-white border-2 border-gray-300 rounded-lg shadow-lg">
          <p className="text-xs text-gray-600 mb-3 font-semibold">Filter Results:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Rating Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Minimum Rating</label>
              <select
                value={filters.minRating}
                onChange={(e) => setFilters({ ...filters, minRating: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:outline-none text-sm"
              >
                <option value="0">Any Rating</option>
                <option value="4">4+ Stars</option>
                <option value="4.5">4.5+ Stars</option>
                <option value="5">5 Stars</option>
              </select>
            </div>

            {/* School Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">School</label>
              <select
                value={filters.school}
                onChange={(e) => setFilters({ ...filters, school: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:outline-none text-sm"
              >
                <option value="any">All Schools</option>
                {availableSchools.map((school) => (
                  <option key={school} value={school}>{school}</option>
                ))}
              </select>
            </div>

            {/* Verified Only */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Verification</label>
              <label className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg cursor-pointer hover:border-itutor-green transition">
                <input
                  type="checkbox"
                  checked={filters.verifiedOnly}
                  onChange={(e) => setFilters({ ...filters, verifiedOnly: e.target.checked })}
                  className="w-4 h-4 text-itutor-green rounded focus:ring-itutor-green"
                />
                <span className="text-sm text-gray-900">Verified Only</span>
              </label>
            </div>
          </div>
          <button
            onClick={() => setFilters({ minRating: 0, country: 'any', school: 'any', verifiedOnly: false })}
            className="mt-3 text-sm text-gray-600 hover:text-itutor-green transition font-medium"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Results Dropdown */}
      {results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border-2 border-gray-300 rounded-lg shadow-2xl max-h-[500px] overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-itutor-green mx-auto"></div>
              <p className="text-gray-600 text-sm mt-2">Searching...</p>
            </div>
          ) : (
            <>
              {/* Results Count */}
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-900 font-semibold">
                  {results.length} {results.length === 1 ? (targetRole === 'tutor' ? 'tutor' : 'student') : (targetRole === 'tutor' ? 'tutors' : 'students')} found
                  {targetRole === 'tutor' && searchMode === 'subject' && (
                    <span className="text-gray-600 font-normal"> • Verified iTutors shown first</span>
                  )}
                </p>
              </div>

              {/* View All Results Button for Subject Search */}
              {targetRole === 'tutor' && searchMode === 'subject' && (
                <button
                  onClick={handleSubjectSearch}
                  className="w-full px-4 py-3 bg-itutor-green hover:bg-emerald-600 text-white font-bold transition border-b border-gray-200 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  View All {results.length} Results for "{query}"
                </button>
              )}

              {/* Results List */}
              {results.slice(0, searchMode === 'subject' ? 5 : 10).map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => {
                    onResultClick(profile);
                    setQuery('');
                    setResults([]);
                  }}
                  className={`w-full px-4 py-4 flex items-center gap-3 hover:bg-green-50 transition border-b border-gray-200 last:border-b-0 text-left ${
                    profile.tutor_verification_status === 'VERIFIED' ? 'bg-green-50/50' : ''
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative">
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={getDisplayName(profile)}
                        className="w-14 h-14 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-itutor-green to-emerald-600 flex items-center justify-center text-white font-bold text-lg">
                        {getDisplayName(profile).charAt(0)}
                      </div>
                    )}
                    {/* Verified Badge Overlay */}
                    {profile.tutor_verification_status === 'VERIFIED' && (
                      <div className="absolute -bottom-1 -right-1 bg-itutor-green rounded-full p-1">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-gray-900 font-bold text-base">{getDisplayName(profile)}</p>
                      {profile.tutor_verification_status === 'VERIFIED' && (
                        <span className="px-2 py-0.5 bg-itutor-green/20 border border-itutor-green text-itutor-green text-xs font-bold rounded">
                          VERIFIED
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 truncate">
                      {profile.school || 'No school listed'} {profile.country && `• ${profile.country}`}
                    </p>
                    {profile.subjects_of_study && profile.subjects_of_study.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {profile.subjects_of_study.slice(0, 3).map((subject, idx) => (
                          <span key={idx} className="text-xs px-2 py-0.5 bg-itutor-green/20 text-itutor-green rounded">
                            {subject}
                          </span>
                        ))}
                        {profile.subjects_of_study.length > 3 && (
                          <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                            +{profile.subjects_of_study.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Rating Display */}
                  {targetRole === 'tutor' && (
                    <div className="flex flex-col items-end flex-shrink-0 min-w-[80px]">
                      {profile.average_rating !== null && profile.average_rating !== undefined ? (
                        <>
                          <div className="flex items-center gap-1">
                            <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            <span className="text-base font-bold text-gray-900">{profile.average_rating.toFixed(1)}</span>
                          </div>
                          <span className="text-xs text-gray-500">({profile.total_reviews || 0} reviews)</span>
                        </>
                      ) : (
                        <div className="flex items-center gap-1">
                          <svg className="w-5 h-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          <span className="text-xs text-gray-400 italic">New</span>
                        </div>
                      )}
                      <svg className="w-5 h-5 text-itutor-green mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  )}
                  
                  {targetRole !== 'tutor' && (
                    <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

