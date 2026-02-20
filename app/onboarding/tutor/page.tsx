'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import { Institution } from '@/lib/hooks/useInstitutionsSearch';
import { PAID_CLASSES_DISABLED_MESSAGE } from '@/lib/featureFlags/paidClasses';
import { ensureSchoolCommunityAndMembership } from '@/lib/actions/community';

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
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Profile update error:', updateError);
        setError(`Error updating profile: ${updateError.message}`);
        setSubmitting(false);
        return;
      }

      // Get subject IDs from labels
      const { data: subjects, error: fetchError } = await supabase
        .from('subjects')
        .select('id, label')
        .in('label', selectedSubjects);

      if (fetchError || !subjects || subjects.length === 0) {
        console.error('Subjects fetch error:', fetchError);
        setError('Error finding selected subjects. Please try again.');
        setSubmitting(false);
        return;
      }

      // Delete existing tutor_subjects
      const { error: deleteError } = await supabase
        .from('tutor_subjects')
        .delete()
        .eq('tutor_id', userId);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        setError('Error clearing previous subjects. Please try again.');
        setSubmitting(false);
        return;
      }

      // Insert new tutor_subjects
      const flagsRes = await fetch('/api/feature-flags', { cache: 'no-store' });
      const flags = await flagsRes.json();
      const paidEnabled = Boolean(flags?.paidClassesEnabled);

      const response = await fetch('/api/tutor/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects: subjects.map((subject) => ({
            subject_id: subject.id,
            // Always save a valid positive price to satisfy DB constraints.
            // During launch, payments can still be forced free elsewhere via feature flag.
            price_per_hour_ttd: 100,
            mode: 'either',
          })),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        console.error('Insert error:', result);
        setError(`Error saving subjects: ${result?.error || 'Unknown error'}`);
        setSubmitting(false);
        return;
      }

      if (!paidEnabled) {
        console.log(PAID_CLASSES_DISABLED_MESSAGE);
      }

      // Verify subjects were saved
      const { data: savedSubjects, error: verifyError } = await supabase
        .from('tutor_subjects')
        .select('id')
        .eq('tutor_id', userId);

      console.log('Saved subjects:', savedSubjects);

      if (verifyError || !savedSubjects || savedSubjects.length === 0) {
        console.error('Verification failed:', verifyError);
        setError('Subjects were not saved correctly. Please try again.');
        setSubmitting(false);
        return;
      }

      const ensure = await ensureSchoolCommunityAndMembership(userId!);
      if (!ensure.success) {
        console.error('Ensure school community:', ensure.error);
        setError(ensure.error ?? 'Could not join school community. You can try again from the Community page.');
        setSubmitting(false);
        return;
      }

      console.log('Onboarding complete, redirecting to dashboard');
      router.push('/tutor/dashboard');
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-200 border-t-emerald-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-blue-50 px-4 py-8 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-emerald-300/30 to-teal-200/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-200/30 to-cyan-200/30 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>
      
      <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-8 max-w-3xl w-full relative border border-white/50">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg transform hover:scale-105 transition-transform duration-200">
            <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent mb-3">
            Set up your tutor profile
          </h1>
          <p className="text-gray-700 text-lg">
            Add your subjects and teaching levels so students can find you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded-xl shadow-sm">
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {/* School/Institution */}
          <div className="bg-gradient-to-br from-emerald-50/50 to-teal-50/50 p-6 rounded-xl border border-emerald-100/50">
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              School or Institution <span className="text-red-500">*</span>
            </label>
            <p className="text-sm text-gray-600 mb-3">
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
          <div className="bg-gradient-to-br from-blue-50/50 to-cyan-50/50 p-6 rounded-xl border border-blue-100/50">
            <label className="block text-sm font-semibold text-gray-800 mb-3">
              Subjects You Can Teach <span className="text-red-500">*</span>
            </label>
            <p className="text-sm text-gray-600 mb-3">Type to search and select subjects you're qualified to teach</p>
            <SubjectMultiSelect
              selectedSubjects={selectedSubjects}
              onChange={setSelectedSubjects}
              disabled={submitting}
              placeholder="Type subject name (e.g. CSEC Math, CAPE Physics)..."
            />
          </div>

          {/* Teaching Levels */}
          <div className="bg-gradient-to-br from-teal-50/50 to-emerald-50/50 p-6 rounded-xl border border-teal-100/50">
            <label className="block text-sm font-semibold text-gray-800 mb-3">
              Teaching Levels <span className="text-red-500">*</span>
            </label>
            <p className="text-sm text-gray-600 mb-3">Select all levels you can teach</p>
            <div className="flex flex-wrap gap-3">
              {TEACHING_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => toggleLevel(level)}
                  className={`px-5 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all duration-200 shadow-sm ${
                    selectedLevels.includes(level)
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-emerald-500 shadow-emerald-500/30 transform scale-105'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400 hover:shadow-md'
                  }`}
                  disabled={submitting}
                >
                  {level}
                </button>
              ))}
            </div>
            {selectedLevels.length > 0 && (
              <p className="text-sm text-emerald-700 font-medium mt-3">
                ✓ Selected: {selectedLevels.length} level{selectedLevels.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-4 px-6 rounded-xl hover:from-emerald-600 hover:to-teal-700 focus:ring-4 focus:ring-emerald-300 focus:outline-none transition-all duration-200 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/30 transform hover:scale-[1.02] active:scale-[0.98] mt-8"
          >
            {submitting ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </span>
            ) : (
              'Complete Profile'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

