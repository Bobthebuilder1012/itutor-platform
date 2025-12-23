'use client';

import { useState, useMemo } from 'react';
import { SUBJECTS } from '@/lib/subjects';

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

  const filteredSubjects = useMemo(() => {
    if (!searchQuery.trim()) {
      return SUBJECTS.slice(0, 10); // Show first 10 by default
    }

    const query = searchQuery.toLowerCase();
    return SUBJECTS.filter(
      (subject) =>
        subject.label.toLowerCase().includes(query) ||
        subject.name.toLowerCase().includes(query)
    ).slice(0, 15); // Show max 15 results
  }, [searchQuery]);

  const availableSubjects = useMemo(
    () => filteredSubjects.filter((subject) => !selectedSubjects.includes(subject.label)),
    [filteredSubjects, selectedSubjects]
  );

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
            setIsDropdownOpen(true);
          }}
          onFocus={() => setIsDropdownOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition"
        />
        
        {/* Dropdown Results */}
        {isDropdownOpen && availableSubjects.length > 0 && !disabled && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {availableSubjects.map((subject) => (
              <button
                key={subject.label}
                type="button"
                onClick={() => addSubject(subject.label)}
                className="w-full text-left px-4 py-2 hover:bg-blue-50 transition flex items-center justify-between group"
              >
                <span className="text-sm text-gray-700 group-hover:text-blue-700">
                  {subject.label}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    subject.level === 'CSEC'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}
                >
                  {subject.level}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* No results message */}
        {isDropdownOpen && availableSubjects.length === 0 && searchQuery.trim() && !disabled && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
            <p className="text-sm text-gray-500 text-center">
              No subjects found matching "{searchQuery}"
            </p>
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
            const subject = SUBJECTS.find((s) => s.label === subjectLabel);
            const isCSEC = subject?.level === 'CSEC';

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


