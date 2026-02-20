'use client';

import { useState } from 'react';
import { useInstitutionsSearch, Institution, InstitutionSearchFilters } from '@/lib/hooks/useInstitutionsSearch';

type InstitutionAutocompleteProps = {
  selectedInstitution: Institution | null;
  onChange: (institution: Institution | null) => void;
  filters?: InstitutionSearchFilters;
  disabled?: boolean;
  placeholder?: string;
  required?: boolean;
};

export default function InstitutionAutocomplete({
  selectedInstitution,
  onChange,
  filters = {},
  disabled = false,
  placeholder = 'Type to search institutions...',
  required = false,
}: InstitutionAutocompleteProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { results, loading, error } = useInstitutionsSearch(searchQuery, filters);

  const handleSelect = (institution: Institution) => {
    onChange(institution);
    setSearchQuery('');
    setIsDropdownOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setSearchQuery('');
  };

  const handleInputChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim()) {
      setIsDropdownOpen(true);
    } else {
      setIsDropdownOpen(false);
    }
  };

  // Get badge color based on institution level
  const getLevelBadgeColor = (level: string) => {
    return level === 'secondary'
      ? 'bg-blue-100 text-blue-700'
      : 'bg-green-100 text-green-700';
  };

  return (
    <div className="space-y-3">
      {/* Selected Institution Display */}
      {selectedInstitution && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">{selectedInstitution.name}</p>
            <div className="flex gap-2 mt-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded ${getLevelBadgeColor(selectedInstitution.institution_level)}`}>
                {selectedInstitution.institution_level === 'secondary' ? 'Secondary' : selectedInstitution.institution_level === 'tertiary' ? 'Tertiary' : selectedInstitution.institution_level || '—'}
              </span>
              {selectedInstitution.island && (
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                  {selectedInstitution.island}
                </span>
              )}
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-2 hover:bg-blue-100 rounded-full transition"
              aria-label="Clear selection"
            >
              <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Search Input (shown when no selection or while searching) */}
      {!selectedInstitution && (
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => {
              if (searchQuery.trim()) {
                setIsDropdownOpen(true);
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            required={required && !selectedInstitution}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition"
          />

          {/* Loading indicator */}
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            </div>
          )}

          {/* Dropdown Results */}
          {isDropdownOpen && !loading && results.length > 0 && !disabled && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
              {results.map((institution) => (
                <button
                  key={institution.id}
                  type="button"
                  onClick={() => handleSelect(institution)}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition border-b border-gray-100 last:border-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {institution.name}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded ${getLevelBadgeColor(institution.institution_level)}`}>
                          {institution.institution_level === 'secondary' ? 'Secondary' : institution.institution_level === 'tertiary' ? 'Tertiary' : institution.institution_level || '—'}
                        </span>
                        {institution.island && (
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                            {institution.island}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* No results message */}
          {isDropdownOpen && !loading && results.length === 0 && searchQuery.trim() && !disabled && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
              <p className="text-sm text-gray-500 text-center">
                No institutions found matching &quot;{searchQuery}&quot;
              </p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-red-200 rounded-lg shadow-lg p-4">
              <p className="text-sm text-red-600 text-center">{error}</p>
            </div>
          )}

          {/* Hint text */}
          {!searchQuery && !loading && (
            <p className="text-xs text-gray-500 mt-1.5">
              Start typing to search (e.g., &quot;Queen&quot;, &quot;UWI&quot;, &quot;Presentation&quot;)
            </p>
          )}
        </div>
      )}

      {/* Click outside to close dropdown */}
      {isDropdownOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </div>
  );
}

