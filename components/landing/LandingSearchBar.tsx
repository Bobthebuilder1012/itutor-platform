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

  const placeholder = 'Search subjects...';

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Large Search Input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyPress}
          onFocus={() => {
            if (subjectSuggestions.length > 0) {
              setShowDropdown(true);
            }
          }}
          placeholder={placeholder}
          className="w-full px-8 py-5 pl-16 bg-white border-2 border-gray-300 rounded-2xl text-gray-900 text-lg placeholder-gray-500 focus:outline-none focus:border-itutor-green focus:ring-4 focus:ring-itutor-green/20 transition-all shadow-xl hover:shadow-2xl"
        />
        <svg
          className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400"
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

      {/* Dropdown Results - Subject Suggestions Only */}
      {showDropdown && (
        <div className="absolute z-50 w-full mt-3 bg-white border-2 border-gray-200 rounded-2xl shadow-2xl max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green mx-auto"></div>
              <p className="text-gray-600 text-base mt-3">Searching subjects...</p>
            </div>
          ) : (
            <>
              {subjectSuggestions.length > 0 ? (
                <>
                  <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
                    <p className="text-base text-gray-700 font-semibold">
                      Select a subject
                    </p>
                  </div>
                  {subjectSuggestions.map((subject) => (
                    <button
                      key={subject.id}
                      onClick={() => handleSubjectSelect(subject)}
                      className="w-full px-5 py-4 flex items-center gap-4 hover:bg-emerald-50 transition border-b border-gray-100 last:border-b-0 text-left group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-itutor-green to-emerald-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                      <span className="text-gray-900 font-semibold text-lg">{subject.label}</span>
                    </button>
                  ))}
                </>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-gray-500 text-base">No subjects found</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
