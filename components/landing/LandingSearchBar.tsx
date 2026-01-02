'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types/database';
import { getDisplayName } from '@/lib/utils/displayName';

type ProfileWithRating = Profile & {
  average_rating?: number | null;
  total_reviews?: number;
};

type SearchMode = 'tutor' | 'subject';

type Subject = {
  id: string;
  name: string;
  label: string;
};

export default function LandingSearchBar() {
  const router = useRouter();
  const [searchMode, setSearchMode] = useState<SearchMode>('tutor');
  const [query, setQuery] = useState('');
  const [tutorResults, setTutorResults] = useState<ProfileWithRating[]>([]);
  const [subjectSuggestions, setSubjectSuggestions] = useState<Subject[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setTutorResults([]);
      setSubjectSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(() => {
      if (searchMode === 'tutor') {
        searchTutors();
      } else {
        searchSubjects();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchMode]);

  async function searchSubjects() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name, label')
        .or(`name.ilike.%${query}%,label.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;

      setSubjectSuggestions(data || []);
      setShowDropdown(true);
    } catch (err) {
      console.error('Error searching subjects:', err);
      setSubjectSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  async function searchTutors() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'tutor')
        .or(`display_name.ilike.%${query}%,full_name.ilike.%${query}%,username.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;
      
      // Fetch tutor ratings
      if (data && data.length > 0) {
        const tutorIds = data.map(profile => profile.id);
        
        const { data: ratingsData } = await supabase
          .from('ratings')
          .select('tutor_id, stars')
          .in('tutor_id', tutorIds);
        
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
        const profilesWithRatings = data.map(profile => ({
          ...profile,
          average_rating: ratingsMap.get(profile.id)?.average || null,
          total_reviews: ratingsMap.get(profile.id)?.count || 0,
        }));

        // Sort: verified tutors first, then by rating
        profilesWithRatings.sort((a, b) => {
          const aVerified = a.tutor_verification_status === 'VERIFIED' ? 1 : 0;
          const bVerified = b.tutor_verification_status === 'VERIFIED' ? 1 : 0;
          if (aVerified !== bVerified) return bVerified - aVerified;

          const aRating = a.average_rating || 0;
          const bRating = b.average_rating || 0;
          return bRating - aRating;
        });
        
        setTutorResults(profilesWithRatings);
        setShowDropdown(true);
      } else {
        setTutorResults([]);
      }
    } catch (err) {
      console.error('Search error:', err);
      setTutorResults([]);
    } finally {
      setLoading(false);
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTutorClick = (tutorId: string) => {
    router.push(`/tutors/${tutorId}`);
    setShowDropdown(false);
  };

  const handleSubjectSelect = (subject: Subject) => {
    setQuery(subject.label || subject.name);
    setShowDropdown(false);
    // Navigate to search results page with the selected subject
    router.push(`/search?subject=${encodeURIComponent(subject.label || subject.name)}&mode=subject`);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (searchMode === 'subject' && query.length >= 2) {
        router.push(`/search?subject=${encodeURIComponent(query)}&mode=subject`);
        setShowDropdown(false);
      } else if (searchMode === 'tutor' && tutorResults.length > 0) {
        handleTutorClick(tutorResults[0].id);
      }
    }
  };

  const placeholder = searchMode === 'tutor' 
    ? 'Search for iTutors by name or username'
    : 'Search for a subject (e.g., Math, Biology, Chemistry)';

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Search Mode Toggle */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => {
            setSearchMode('tutor');
            setQuery('');
            setTutorResults([]);
            setSubjectSuggestions([]);
            setShowDropdown(false);
          }}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
            searchMode === 'tutor'
              ? 'bg-itutor-green/20 text-itutor-green border border-itutor-green/30'
              : 'text-itutor-muted/60 hover:text-itutor-muted hover:bg-itutor-border/30'
          }`}
        >
          By Name
        </button>
        <button
          onClick={() => {
            setSearchMode('subject');
            setQuery('');
            setTutorResults([]);
            setSubjectSuggestions([]);
            setShowDropdown(false);
          }}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
            searchMode === 'subject'
              ? 'bg-itutor-green/20 text-itutor-green border border-itutor-green/30'
              : 'text-itutor-muted/60 hover:text-itutor-muted hover:bg-itutor-border/30'
          }`}
        >
          By Subject
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          onFocus={() => {
            if ((searchMode === 'tutor' && tutorResults.length > 0) || (searchMode === 'subject' && subjectSuggestions.length > 0)) {
              setShowDropdown(true);
            }
          }}
          placeholder={placeholder}
          className="w-full px-5 py-3 pl-12 bg-itutor-card border border-itutor-border rounded-xl text-itutor-white placeholder-itutor-muted focus:outline-none focus:border-itutor-green transition-colors"
        />
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-itutor-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Dropdown Results */}
      {showDropdown && (
        <div className="absolute z-50 w-full mt-2 bg-itutor-card border border-itutor-border rounded-lg shadow-2xl max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-itutor-green mx-auto"></div>
              <p className="text-itutor-muted text-sm mt-2">Searching...</p>
            </div>
          ) : searchMode === 'subject' ? (
            /* Subject Suggestions */
            <>
              {subjectSuggestions.length > 0 ? (
                <>
                  <div className="px-4 py-3 border-b border-itutor-border bg-itutor-black/30">
                    <p className="text-sm text-itutor-white font-semibold">
                      Select a subject
                    </p>
                  </div>
                  {subjectSuggestions.map((subject) => (
                    <button
                      key={subject.id}
                      onClick={() => handleSubjectSelect(subject)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-itutor-green/10 transition border-b border-itutor-border last:border-b-0 text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                      <span className="text-itutor-white font-medium">{subject.label || subject.name}</span>
                    </button>
                  ))}
                </>
              ) : (
                <div className="p-6 text-center">
                  <p className="text-itutor-muted">No subjects found</p>
                </div>
              )}
            </>
          ) : (
            /* Tutor Results */
            <>
              {tutorResults.length > 0 ? (
                <>
                  <div className="px-4 py-3 border-b border-itutor-border bg-itutor-black/30">
                    <p className="text-sm text-itutor-white font-semibold">
                      {tutorResults.length} {tutorResults.length === 1 ? 'iTutor' : 'iTutors'} found
                    </p>
                  </div>
                  {tutorResults.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => handleTutorClick(profile.id)}
                      className={`w-full px-4 py-4 flex items-center gap-3 hover:bg-itutor-green/10 transition border-b border-itutor-border last:border-b-0 text-left ${
                        profile.tutor_verification_status === 'VERIFIED' ? 'bg-itutor-green/5' : ''
                      }`}
                    >
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={getDisplayName(profile)}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-itutor-green to-emerald-600 flex items-center justify-center text-white font-bold text-lg">
                            {getDisplayName(profile).charAt(0)}
                          </div>
                        )}
                        {profile.tutor_verification_status === 'VERIFIED' && (
                          <div className="absolute -bottom-1 -right-1 bg-itutor-green rounded-full p-1">
                            <svg className="w-3 h-3 text-gray-900" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-itutor-white font-bold text-base">{getDisplayName(profile)}</p>
                          {profile.tutor_verification_status === 'VERIFIED' && (
                            <span className="px-2 py-0.5 bg-itutor-green/20 border border-itutor-green text-itutor-green text-xs font-bold rounded">
                              VERIFIED
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-itutor-muted truncate">
                          @{profile.username}
                        </p>
                      </div>
                      
                      {/* Rating */}
                      <div className="flex flex-col items-end flex-shrink-0">
                        {profile.average_rating !== null && profile.average_rating !== undefined ? (
                          <div className="flex items-center gap-1">
                            <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            <span className="text-sm font-bold text-itutor-white">{profile.average_rating.toFixed(1)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-itutor-muted italic">New</span>
                        )}
                      </div>
                    </button>
                  ))}
                </>
              ) : (
                <div className="p-6 text-center">
                  <p className="text-itutor-muted">No iTutors found</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
