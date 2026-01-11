'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

type Subject = {
  id: string;
  name: string;
  curriculum: string;
  level: string;
  label: string;
};

type SubjectMultiSelectProps = {
  selectedSubjects: string[];
  onChange: (subjects: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
};

export default function SubjectMultiSelect({
  selectedSubjects,
  onChange,
  disabled = false,
  placeholder = 'Type to search subjects...',
}: SubjectMultiSelectProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced search - triggers on ANY input
  useEffect(() => {
    if (!searchQuery.trim()) {
      setAvailableSubjects([]);
      setIsDropdownOpen(false);
      return;
    }

    const timer = setTimeout(() => {
      searchSubjects();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Re-filter when selected subjects change
  useEffect(() => {
    if (availableSubjects.length > 0) {
      const filtered = availableSubjects.filter(
        subject => !selectedSubjects.includes(subject.label)
      );
      if (filtered.length !== availableSubjects.length) {
        setAvailableSubjects(filtered);
      }
    }
  }, [selectedSubjects]);

  async function searchSubjects() {
    setLoading(true);
    try {
      console.log('🔍 Searching subjects for:', searchQuery);
      console.log('🔑 Supabase client initialized:', !!supabase);
      
      const { data, error, count } = await supabase
        .from('subjects')
        .select('id, name, curriculum, level', { count: 'exact' })
        .ilike('name', `%${searchQuery}%`)
        .order('name', { ascending: true })
        .limit(15);

      console.log('📚 Search results:', {
        found: data?.length || 0,
        total: count,
        data: data,
        error: error
      });

      if (error) {
        console.error('❌ Supabase error:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        setAvailableSubjects([]);
        setIsDropdownOpen(true);
        return;
      }

      if (!data || data.length === 0) {
        console.warn('⚠️ No subjects found in database for query:', searchQuery);
      }

      // Map to include a display label and filter out already selected
      const mappedData = data
        ?.map(s => ({
          id: s.id,
          name: s.name,
          curriculum: s.curriculum,
          level: s.level,
          label: `${s.name} (${s.curriculum} ${s.level})`
        }))
        .filter(subject => !selectedSubjects.includes(subject.label)) || [];

      console.log('✅ Mapped data:', mappedData.length, 'subjects after filtering');
      setAvailableSubjects(mappedData);
      setIsDropdownOpen(true);
    } catch (err) {
      console.error('💥 Unexpected error:', err);
      setAvailableSubjects([]);
      setIsDropdownOpen(true);
    } finally {
      setLoading(false);
    }
  }

  const addSubject = (subjectLabel: string) => {
    if (!selectedSubjects.includes(subjectLabel)) {
      onChange([...selectedSubjects, subjectLabel]);
      setSearchQuery('');
      setIsDropdownOpen(false);
    }
  };

  const removeSubject = (subjectLabel: string) => {
    onChange(selectedSubjects.filter((s) => s !== subjectLabel));
  };

  return (
    <div className="space-y-3">
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
          }}
          onFocus={() => {
            if (availableSubjects.length > 0 || searchQuery.trim()) {
              setIsDropdownOpen(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition"
        />
        
        {/* Dropdown Results */}
        {isDropdownOpen && !disabled && searchQuery.trim() && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
                <p className="text-gray-500 text-sm mt-2">Searching...</p>
              </div>
            ) : availableSubjects.length > 0 ? (
              <>
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <p className="text-xs text-gray-600 font-medium">Did you mean?</p>
                </div>
                {availableSubjects.map((subject) => (
                  <button
                    key={subject.id}
                    type="button"
                    onClick={() => addSubject(subject.label)}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 transition flex items-center justify-between group border-b border-gray-100 last:border-b-0"
                  >
                    <span className="text-sm text-gray-700 group-hover:text-blue-700 font-medium">
                      {subject.name}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        subject.curriculum === 'CSEC'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {subject.curriculum} {subject.level}
                    </span>
                  </button>
                ))}
              </>
            ) : (
              <div className="p-4">
                <p className="text-sm text-gray-500 text-center">
                  No subjects found matching "{searchQuery}"
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Click outside to close dropdown */}
      {isDropdownOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsDropdownOpen(false)}
        />
      )}

      {/* Selected Subjects as Chips */}
      {selectedSubjects.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedSubjects.map((subjectLabel) => {
            // Determine if CSEC based on label
            const isCSEC = subjectLabel.includes('(CSEC');

            return (
              <div
                key={subjectLabel}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                  isCSEC
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-purple-100 text-purple-800 border border-purple-200'
                }`}
              >
                <span>{subjectLabel}</span>
                <button
                  type="button"
                  onClick={() => removeSubject(subjectLabel)}
                  disabled={disabled}
                  className="hover:bg-white hover:bg-opacity-50 rounded-full p-0.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={`Remove ${subjectLabel}`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Helper text */}
      {selectedSubjects.length > 0 && (
        <p className="text-sm text-gray-600">
          {selectedSubjects.length} subject{selectedSubjects.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  );
}














