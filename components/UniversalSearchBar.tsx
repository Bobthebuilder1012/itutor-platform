'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types/database';
import { getDisplayName } from '@/lib/utils/displayName';
import UserAvatar from '@/components/UserAvatar';

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
    ? (targetRole === 'tutor' ? "Search iTutors by name or username..." : "Search students by name or username...")
    : "Search by subject (e.g. Mathematics, Biology, Chemistry)...";

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
    <div className="relative w-full" data-search-container>
      <div className="flex items-center gap-3">
        {/* Mode toggle pills */}
        {targetRole === 'tutor' && (
          <div className="flex-shrink-0 flex items-center gap-0.5 bg-gray-100 rounded-xl p-1">
            {(['tutor', 'subject'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => { setSearchMode(mode); setQuery(''); setResults([]); }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  searchMode === mode
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {mode === 'tutor' ? 'By Name' : 'By Subject'}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex-1 relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" strokeWidth={2} />
            <path d="m21 21-4.35-4.35" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:bg-white focus:border-itutor-green focus:ring-2 focus:ring-itutor-green/10 focus:outline-none transition placeholder-gray-400"
          />
          {loading && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-itutor-green border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Filter toggle */}
        {targetRole === 'tutor' && searchMode === 'subject' && results.length > 0 && (
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold rounded-xl border transition-all ${
              showFilters
                ? 'bg-itutor-green/10 border-itutor-green/30 text-itutor-green'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-itutor-green/30 hover:text-itutor-green'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
          </button>
        )}
      </div>

      {/* Filter panel */}
      {targetRole === 'tutor' && searchMode === 'subject' && results.length > 0 && showFilters && (
        <div className="mt-2 p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Min Rating</label>
              <select
                value={filters.minRating}
                onChange={(e) => setFilters({ ...filters, minRating: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl text-sm focus:border-itutor-green focus:ring-2 focus:ring-itutor-green/10 focus:outline-none"
              >
                <option value="0">Any Rating</option>
                <option value="4">4+ Stars</option>
                <option value="4.5">4.5+ Stars</option>
                <option value="5">5 Stars</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">School</label>
              <select
                value={filters.school}
                onChange={(e) => setFilters({ ...filters, school: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl text-sm focus:border-itutor-green focus:ring-2 focus:ring-itutor-green/10 focus:outline-none"
              >
                <option value="any">All Schools</option>
                {availableSchools.map((school) => (
                  <option key={school} value={school}>{school}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Verification</label>
              <label className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:border-itutor-green transition-colors">
                <input
                  type="checkbox"
                  checked={filters.verifiedOnly}
                  onChange={(e) => setFilters({ ...filters, verifiedOnly: e.target.checked })}
                  className="w-4 h-4 accent-itutor-green rounded"
                />
                <span className="text-sm text-gray-700">Verified only</span>
              </label>
            </div>
          </div>
          <button
            onClick={() => setFilters({ minRating: 0, country: 'any', school: 'any', verifiedOnly: false })}
            className="mt-3 text-xs text-gray-400 hover:text-itutor-green transition-colors font-medium"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Results dropdown */}
      {results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden max-h-[480px] overflow-y-auto">
          {/* Header */}
          <div className="px-4 py-2.5 border-b border-gray-50 bg-gray-50/80 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500">
              {results.length} {targetRole === 'tutor' ? 'tutor' : 'student'}{results.length !== 1 ? 's' : ''} found
              {targetRole === 'tutor' && searchMode === 'subject' && (
                <span className="font-normal"> · verified first</span>
              )}
            </p>
            {targetRole === 'tutor' && searchMode === 'subject' && (
              <button
                onClick={handleSubjectSearch}
                className="text-xs font-semibold text-itutor-green hover:text-emerald-600 transition-colors"
              >
                View all →
              </button>
            )}
          </div>

          {/* Result rows */}
          {results.slice(0, searchMode === 'subject' ? 5 : 10).map((profile) => (
            <button
              key={profile.id}
              onClick={() => { onResultClick(profile); setQuery(''); setResults([]); }}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 text-left"
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <UserAvatar avatarUrl={profile.avatar_url} name={getDisplayName(profile)} size={40} />
                {profile.tutor_verification_status === 'VERIFIED' && (
                  <div className="absolute -bottom-0.5 -right-0.5 bg-itutor-green rounded-full p-0.5">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-gray-900 truncate">{getDisplayName(profile)}</p>
                  {profile.tutor_verification_status === 'VERIFIED' && (
                    <span className="flex-shrink-0 px-1.5 py-0.5 bg-itutor-green/10 text-itutor-green text-[10px] font-bold rounded-md">
                      VERIFIED
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate">
                  {[profile.school, profile.country].filter(Boolean).join(' · ') || 'No details'}
                </p>
                {profile.subjects_of_study && profile.subjects_of_study.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {profile.subjects_of_study.slice(0, 2).map((s, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md">{s}</span>
                    ))}
                    {profile.subjects_of_study.length > 2 && (
                      <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-400 rounded-md">+{profile.subjects_of_study.length - 2}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Rating */}
              {targetRole === 'tutor' && (
                <div className="flex-shrink-0 text-right">
                  {profile.average_rating != null ? (
                    <>
                      <div className="flex items-center gap-0.5 justify-end">
                        <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="text-sm font-bold text-gray-900">{profile.average_rating.toFixed(1)}</span>
                      </div>
                      <p className="text-[10px] text-gray-400">{profile.total_reviews || 0} reviews</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400 italic">New</p>
                  )}
                </div>
              )}

              <svg className="w-4 h-4 text-gray-300 flex-shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

