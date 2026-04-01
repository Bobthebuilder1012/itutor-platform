'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

type Subject = {
  id: string;
  name: string;
  label: string;
};

export default function LandingSearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [subjectSuggestions, setSubjectSuggestions] = useState<Subject[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search - subjects only (works with 1+ characters)
  useEffect(() => {
    if (query.length < 1) {
      setSubjectSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(() => {
      searchSubjects();
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  async function searchSubjects() {
    setLoading(true);
    try {
      console.log('🔍 Searching for:', query);
      
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name, label')
        .ilike('name', `%${query}%`)
        .order('name', { ascending: true })
        .limit(15);

      console.log('📚 Search results:', data);
      console.log('❌ Search error:', error);

      if (error) {
        console.error('Supabase error details:', error);
        throw error;
      }

      // Use the label from the database
      const mappedData = data?.map(s => ({
        id: s.id,
        name: s.name,
        label: s.label
      })) || [];

      setSubjectSuggestions(mappedData);
      if (mappedData && mappedData.length > 0) {
        setShowDropdown(true);
      }
    } catch (err) {
      console.error('Error searching subjects:', err);
      setSubjectSuggestions([]);
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

  const handleSubjectSelect = (subject: Subject) => {
    setQuery(subject.name);
    setShowDropdown(false);
    // Navigate to search results page with the selected subject
    router.push(`/search?subject=${encodeURIComponent(subject.name)}&mode=subject`);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // If there are suggestions and user presses enter, select the first one
      if (subjectSuggestions.length > 0) {
        handleSubjectSelect(subjectSuggestions[0]);
      } else if (query.length >= 1) {
        // Otherwise search with the typed query
        router.push(`/search?subject=${encodeURIComponent(query)}&mode=subject`);
        setShowDropdown(false);
      }
    }
  };

  const placeholder = 'Search by subject or tutor...';

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Search Input — pill on mobile, rounded-2xl on sm+ */}
      <div className="relative flex items-center rounded-full border border-gray-200 bg-white shadow-md transition-shadow focus-within:ring-2 focus-within:ring-itutor-green/25 sm:rounded-2xl sm:border-2 sm:border-gray-300 sm:shadow-none sm:focus-within:border-itutor-green sm:focus-within:ring-4 sm:focus-within:ring-itutor-green/20 2xl:rounded-3xl">
        {/* Icon — inline on mobile, absolute on sm+ */}
        <svg
          className="ml-4 h-4 w-4 shrink-0 text-gray-400 sm:absolute sm:left-5 sm:ml-0 sm:h-6 sm:w-6 sm:top-1/2 sm:-translate-y-1/2 2xl:left-6 2xl:h-8 2xl:w-8 3xl:left-7 3xl:h-10 3xl:w-10"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyPress}
          onFocus={() => {
            if (subjectSuggestions.length > 0) setShowDropdown(true);
          }}
          placeholder={placeholder}
          className="flex-1 bg-transparent py-3 pl-3 pr-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none sm:py-5 sm:pl-16 sm:pr-6 sm:text-lg 2xl:rounded-3xl 2xl:py-6 2xl:pl-20 2xl:pr-8 2xl:text-2xl 3xl:py-8 3xl:pl-24 3xl:text-3xl"
        />
        {/* Search button — mobile only */}
        <button
          type="button"
          onClick={() => {
            if (subjectSuggestions.length > 0) {
              handleSubjectSelect(subjectSuggestions[0]);
            } else if (query.length >= 1) {
              router.push(`/search?subject=${encodeURIComponent(query)}&mode=subject`);
              setShowDropdown(false);
            } else {
              router.push('/search');
            }
          }}
          className="m-1.5 rounded-full bg-itutor-green px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-500 sm:hidden"
        >
          Search
        </button>
      </div>

      {/* Dropdown Results - Subject Suggestions Only */}
      {showDropdown && (
        <div className="absolute z-50 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl">
          {loading ? (
            <div className="p-6 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-itutor-green"></div>
              <p className="mt-2 text-sm text-gray-600">Searching subjects...</p>
            </div>
          ) : (
            <>
              {subjectSuggestions.length > 0 ? (
                <>
                  <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-700">Select a subject</p>
                  </div>
                  {subjectSuggestions.map((subject) => (
                    <button
                      key={subject.id}
                      onClick={() => handleSubjectSelect(subject)}
                      className="group flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-emerald-50"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-itutor-green to-emerald-600 transition-transform group-hover:scale-110">
                        <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{subject.label}</span>
                    </button>
                  ))}
                </>
              ) : (
                <div className="p-6 text-center">
                  <p className="text-sm text-gray-500">No subjects found</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
