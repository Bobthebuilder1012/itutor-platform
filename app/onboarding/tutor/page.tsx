'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import { setUserSubjects } from '@/lib/supabase/userSubjects';
import { Institution } from '@/lib/hooks/useInstitutionsSearch';

const TEACHING_LEVELS = [
  'Form 1',
  'Form 2',
  'Form 3',
  'Form 4',
  'Form 5',
  'CAPE Unit 1',
  'CAPE Unit 2',
];

export default function TutorOnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile || profile.role !== 'tutor') {
        router.push('/login');
        return;
      }

      setUserId(user.id);
      setLoading(false);
    }

    checkAuth();
  }, [router]);

  const toggleLevel = (level: string) => {
    if (selectedLevels.includes(level)) {
      setSelectedLevels(selectedLevels.filter((l) => l !== level));
    } else {
      setSelectedLevels([...selectedLevels, level]);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!selectedInstitution) {
      setError('Please select your school or institution.');
      return;
    }

    if (selectedSubjects.length === 0) {
      setError('Please select at least one subject you can teach.');
      return;
    }

    if (selectedLevels.length === 0) {
      setError('Please select at least one teaching level.');
      return;
    }

    setSubmitting(true);

    try {
      // Update profile with institution
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          school: selectedInstitution.name,
          institution_id: selectedInstitution.id,
          teaching_levels: selectedLevels,
        })
        .eq('id', userId);

      if (updateError) {
        setError('Error updating profile. Please try again.');
        setSubmitting(false);
        return;
      }

      // Set user subjects in junction table
      const { error: subjectsError } = await setUserSubjects(userId!, selectedSubjects);

      if (subjectsError) {
        setError('Error saving subjects. Please try again.');
        setSubmitting(false);
        return;
      }

      router.push('/tutor/dashboard');
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-3xl w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Set up your tutor profile</h1>
          <p className="text-gray-600">
            Add your subjects and teaching levels so students can find you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* School/Institution */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              School or Institution <span className="text-red-500">*</span>
            </label>
            <p className="text-sm text-gray-500 mb-3">
              Search for your school, college, or university
            </p>
            <InstitutionAutocomplete
              selectedInstitution={selectedInstitution}
              onChange={setSelectedInstitution}
              filters={{ country_code: 'TT' }}
              disabled={submitting}
              placeholder="Type to search (e.g. QRC, UWI, Presentation, COSTAATT)..."
              required
            />
          </div>

          {/* Subjects */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Subjects You Can Teach <span className="text-red-500">*</span>
            </label>
            <p className="text-sm text-gray-500 mb-3">Type to search and select subjects you're qualified to teach</p>
            <SubjectMultiSelect
              selectedSubjects={selectedSubjects}
              onChange={setSelectedSubjects}
              disabled={submitting}
              placeholder="Type subject name (e.g. CSEC Math, CAPE Physics)..."
            />
          </div>

          {/* Teaching Levels */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Teaching Levels <span className="text-red-500">*</span>
            </label>
            <p className="text-sm text-gray-500 mb-3">Select all levels you can teach</p>
            <div className="flex flex-wrap gap-3">
              {TEACHING_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => toggleLevel(level)}
                  className={`px-4 py-2 rounded-full border-2 text-sm font-medium transition ${
                    selectedLevels.includes(level)
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
                  }`}
                  disabled={submitting}
                >
                  {level}
                </button>
              ))}
            </div>
            {selectedLevels.length > 0 && (
              <p className="text-sm text-gray-600 mt-3">
                Selected: {selectedLevels.length} level{selectedLevels.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 focus:ring-4 focus:ring-green-300 focus:outline-none transition font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving...' : 'Complete Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}

