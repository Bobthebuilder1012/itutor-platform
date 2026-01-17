'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Subject } from '@/lib/types/database';

type AddSubjectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tutorId: string;
  existingSubjectIds: string[];
  onSubjectAdded: () => void;
};

type SubjectWithPrice = {
  subject: Subject;
  price: string;
};

export default function AddSubjectModal({
  isOpen,
  onClose,
  tutorId,
  existingSubjectIds,
  onSubjectAdded,
}: AddSubjectModalProps) {
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<SubjectWithPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Fetch available subjects when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSubjects();
      setSelectedSubjects([]);
      setSearchQuery('');
      setIsDropdownOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  async function fetchSubjects() {
    setLoadingSubjects(true);
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('*')
        .order('name');

      if (error) {
        console.error('Subjects fetch error:', error);
        alert('Failed to load subjects. Please try again.');
        return;
      }

      if (data) {
        // Filter out subjects the tutor already teaches and sort alphabetically
        const availableSubjects = data
          .filter(s => !existingSubjectIds.includes(s.id))
          .sort((a, b) => a.name.localeCompare(b.name));
        
        setAllSubjects(availableSubjects);
      }
    } catch (error) {
      console.error('Error fetching subjects:', error);
      alert('An error occurred while loading subjects.');
    } finally {
      setLoadingSubjects(false);
    }
  }

  // Get available subjects (not already selected) filtered by search
  const availableSubjects = useMemo(() => {
    const notSelected = allSubjects.filter((subject) => 
      !selectedSubjects.some(s => s.subject.id === subject.id)
    );
    
    if (!searchQuery.trim()) {
      return notSelected.slice(0, 10); // Show first 10 by default
    }
    
    const query = searchQuery.toLowerCase();
    return notSelected.filter((subject) =>
      subject.name.toLowerCase().includes(query) ||
      subject.curriculum.toLowerCase().includes(query) ||
      subject.level.toLowerCase().includes(query)
    ).slice(0, 15); // Show max 15 results
  }, [allSubjects, selectedSubjects, searchQuery]);

  const addSubject = (subjectId: string) => {
    if (!subjectId) return;
    
    const subject = allSubjects.find(s => s.id === subjectId);
    if (subject) {
      setSelectedSubjects([...selectedSubjects, { subject, price: '100' }]);
      setSearchQuery('');
      setIsDropdownOpen(false);
    }
  };

  const removeSubject = (subjectId: string) => {
    setSelectedSubjects(selectedSubjects.filter((s) => s.subject.id !== subjectId));
  };

  const updatePrice = (subjectId: string, price: string) => {
    setSelectedSubjects(selectedSubjects.map(s => 
      s.subject.id === subjectId ? { ...s, price } : s
    ));
  };

  // Calculate commission rate based on price
  const getCommissionRate = (price: number): number => {
    if (price === 0) return 0; // Free sessions - no commission
    if (price < 100) return 10;
    if (price < 200) return 15;
    return 20;
  };

  async function handleAddSubjects() {
    if (selectedSubjects.length === 0) return;

    // Validate all prices
    for (const { subject, price } of selectedSubjects) {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        alert(`Please enter a valid price ($0 or more) for ${subject.name}`);
        return;
      }
    }

    setLoading(true);
    try {
      const tutorSubjects = selectedSubjects.map(({ subject, price }) => ({
        tutor_id: tutorId,
        subject_id: subject.id,
        price_per_hour_ttd: parseFloat(price),
        mode: 'either', // Default to flexible teaching mode (online/in-person/either)
      }));

      const { error } = await supabase
        .from('tutor_subjects')
        .insert(tutorSubjects);

      if (error) throw error;

      alert(`${selectedSubjects.length} subject(s) added successfully!`);
      onSubjectAdded();
      onClose();
      
      // Reset form
      setSelectedSubjects([]);
    } catch (error) {
      console.error('Error adding subjects:', error);
      alert('Failed to add subjects. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-itutor-white mb-2">Add New Subjects</h2>
        <p className="text-gray-400 text-sm mb-3">Search for subjects, then set your rate for each</p>
        
        {/* Free Session Recommendation */}
        <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-2 border-blue-400/50 rounded-lg p-3 mb-6">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-300 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <div>
              <p className="text-sm font-bold text-white mb-1">💡 Pro Tip: Offer Free Sessions</p>
              <p className="text-xs text-gray-200">New to tutoring? Set your rate to <span className="font-bold text-white">$0</span> to offer free sessions. This helps you build ratings and attract your first students—with zero commission!</p>
            </div>
          </div>
        </div>

        {loadingSubjects ? (
          <p className="text-gray-400 text-center py-8">Loading subjects...</p>
        ) : allSubjects.length === 0 ? (
          <p className="text-gray-400 text-center py-8">You're already teaching all available subjects!</p>
        ) : (
          <div className="space-y-5">
            {/* Subject Search */}
            <div className="relative" ref={searchRef}>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Search for a Subject
              </label>
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  disabled={loading || allSubjects.length === 0}
                  placeholder={allSubjects.length === 0 ? 'No more subjects available' : 'Type to search subjects...'}
                  className="w-full bg-gray-900 text-itutor-white border border-gray-700 rounded-lg pl-10 pr-4 py-3 focus:ring-2 focus:ring-itutor-green focus:border-itutor-green disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Dropdown Results */}
              {isDropdownOpen && availableSubjects.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {availableSubjects.map((subject) => (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => addSubject(subject.id)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-800 transition-colors border-b border-gray-800 last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-itutor-white">{subject.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              subject.curriculum === 'CSEC'
                                ? 'bg-blue-900/50 text-blue-300'
                                : subject.curriculum === 'CAPE'
                                ? 'bg-purple-900/50 text-purple-300'
                                : 'bg-gray-700 text-gray-300'
                            }`}
                          >
                            {subject.curriculum}
                          </span>
                          <span className="text-xs text-gray-400">
                            {subject.level}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Subjects with Prices */}
            {selectedSubjects.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">
                  Selected Subjects ({selectedSubjects.length})
                </h3>
                {selectedSubjects.map(({ subject, price }) => {
                  const priceNum = parseFloat(price) || 0;
                  const commissionRate = getCommissionRate(priceNum);
                  const commissionAmount = priceNum * (commissionRate / 100);
                  const earnings = priceNum - commissionAmount;

                  return (
                    <div
                      key={subject.id}
                      className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"
                    >
                      <div className="flex items-center gap-4 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-itutor-white">{subject.name}</h4>
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${
                                subject.curriculum === 'CSEC'
                                  ? 'bg-blue-900/50 text-blue-300'
                                  : 'bg-purple-900/50 text-purple-300'
                              }`}
                            >
                              {subject.curriculum}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400">{subject.level}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={price}
                              onChange={(e) => updatePrice(subject.id, e.target.value)}
                              className="w-24 bg-gray-900 text-itutor-white border border-gray-700 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
                              placeholder="100"
                            />
                          </div>
                          <span className="text-sm text-gray-400">/hr</span>
                          <button
                            type="button"
                            onClick={() => removeSubject(subject.id)}
                            disabled={loading}
                            className="text-red-400 hover:text-red-300 p-1.5 hover:bg-red-900/20 rounded transition disabled:opacity-50"
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      
                      {/* Dynamic Earnings Display */}
                      {priceNum === 0 ? (
                        <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 rounded-lg p-2.5 border-2 border-blue-400/50">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-300" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <div className="flex-1">
                              <p className="text-xs font-bold text-white">FREE Session</p>
                              <p className="text-xs text-gray-200">No commission • Great for building ratings!</p>
                            </div>
                          </div>
                        </div>
                      ) : priceNum > 0 && (
                        <div className="bg-gray-900/50 rounded-lg p-2.5 border border-gray-700/50">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-500">Commission ({commissionRate}%)</span>
                            <span className="text-red-400">-${commissionAmount.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-emerald-400 font-medium">You earn</span>
                            <span className="text-emerald-400 font-bold">${earnings.toFixed(2)}/hr</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Helper text */}
            {selectedSubjects.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                Search and select subjects to add to your profile
              </p>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-semibold transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleAddSubjects}
            disabled={loading || selectedSubjects.length === 0}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Adding...' : `Add ${selectedSubjects.length} Subject${selectedSubjects.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
