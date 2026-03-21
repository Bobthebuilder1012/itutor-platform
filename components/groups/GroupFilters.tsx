'use client';

import { useState } from 'react';
import type { GroupFilters } from '@/lib/types/groups';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';

interface GroupFiltersProps {
  filters: GroupFilters;
  onChange: (filters: GroupFilters) => void;
}

export default function GroupFiltersPanel({ filters, onChange }: GroupFiltersProps) {
  const [open, setOpen] = useState(false);

  const selectedSubjects = filters.subjects ?? [];

  const handleClear = () => {
    onChange({});
  };

  const filterCount =
    (selectedSubjects.length > 0 ? 1 : 0) +
    (filters.tutor_name ? 1 : 0) +
    (filters.form_level ? 1 : 0) +
    (filters.min_rating !== undefined ? 1 : 0) +
    (filters.min_price !== undefined || filters.max_price !== undefined ? 1 : 0) +
    (filters.session_frequency ? 1 : 0) +
    (filters.availability ? 1 : 0);

  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          <span className="font-medium">Filters</span>
          {filterCount > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 bg-emerald-500 text-white text-[10px] rounded-full font-bold">
              {filterCount}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* Subject searchable multi-select */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Subject</label>
            <SubjectMultiSelect
              selectedSubjects={selectedSubjects}
              onChange={(subjects) =>
                onChange({ ...filters, subjects: subjects.length > 0 ? subjects : undefined })
              }
              placeholder="Search CSEC or CAPE subjects…"
            />
          </div>

          {/* Tutor name */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tutor name</label>
            <input
              type="text"
              value={filters.tutor_name ?? ''}
              onChange={(e) => onChange({ ...filters, tutor_name: e.target.value || undefined })}
              placeholder="Search tutor…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Form level</label>
              <select
                value={filters.form_level ?? ''}
                onChange={(e) => onChange({ ...filters, form_level: (e.target.value || '') as any })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Any level</option>
                <option value="FORM_1">Form 1</option>
                <option value="FORM_2">Form 2</option>
                <option value="FORM_3">Form 3</option>
                <option value="FORM_4">Form 4</option>
                <option value="FORM_5">Form 5</option>
                <option value="CAPE">CAPE</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Minimum rating</label>
              <select
                value={filters.min_rating ?? ''}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    min_rating: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Any rating</option>
                <option value="4.5">4.5+</option>
                <option value="4">4.0+</option>
                <option value="3.5">3.5+</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Min price</label>
              <input
                type="number"
                min={0}
                value={filters.min_price ?? ''}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    min_price: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="0"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Max price</label>
              <input
                type="number"
                min={0}
                value={filters.max_price ?? ''}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    max_price: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="200"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Session frequency</label>
              <select
                value={filters.session_frequency ?? ''}
                onChange={(e) => onChange({ ...filters, session_frequency: e.target.value || undefined })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Any frequency</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Availability</label>
              <select
                value={filters.availability ?? ''}
                onChange={(e) => onChange({ ...filters, availability: (e.target.value || '') as any })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Any time</option>
                <option value="today">Today</option>
                <option value="this_week">This week</option>
                <option value="this_month">This month</option>
              </select>
            </div>
          </div>

          {filterCount > 0 && (
            <button
              onClick={handleClear}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
