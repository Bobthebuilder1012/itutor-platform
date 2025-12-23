'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import { setUserSubjects } from '@/lib/supabase/userSubjects';
import { Institution } from '@/lib/hooks/useInstitutionsSearch';

const FORM_LEVELS = ['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Lower 6', 'Upper 6'];

export default function StudentOnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [formLevel, setFormLevel] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
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

      if (!profile || profile.role !== 'student') {
        router.push('/login');
        return;
      }

      setUserId(user.id);
      setLoading(false);
    }

    checkAuth();
  }, [router]);


  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!selectedInstitution) {
      setError('Please select your school.');
      return;
    }

    if (!formLevel) {
      setError('Please select your form level.');
      return;
    }

    if (selectedSubjects.length === 0) {
      setError('Please select at least one subject.');
      return;
    }

    setSubmitting(true);

    try {
      // Update profile with institution, form level, AND subjects array
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          school: selectedInstitution.name,
          institution_id: selectedInstitution.id,
          form_level: formLevel,
          subjects_of_study: selectedSubjects, // Add subjects to profiles table
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Profile update error:', updateError);
        setError('Error updating profile. Please try again.');
        setSubmitting(false);
        return;
      }

      // Set user subjects in junction table
      const { error: subjectsError } = await setUserSubjects(userId!, selectedSubjects);

      if (subjectsError) {
        console.error('Subjects junction table error:', subjectsError);
        setError('Error saving subjects. Please try again.');
        setSubmitting(false);
        return;
      }

      router.push('/student/dashboard');
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Complete your student profile</h1>
          <p className="text-gray-600">
            Tell iTutor about your school, form and subjects so we can match you with the right tutors.
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
              School <span className="text-red-500">*</span>
            </label>
            <p className="text-sm text-gray-500 mb-3">
              Search for your secondary school
            </p>
            <InstitutionAutocomplete
              selectedInstitution={selectedInstitution}
              onChange={setSelectedInstitution}
              filters={{ institution_level: 'secondary', country_code: 'TT' }}
              disabled={submitting}
              placeholder="Type to search (e.g. Queen's, Presentation, Naparima)..."
              required
            />
          </div>

          {/* Form Level */}
          <div>
            <label htmlFor="formLevel" className="block text-sm font-medium text-gray-700 mb-2">
              Form Level <span className="text-red-500">*</span>
            </label>
            <select
              id="formLevel"
              value={formLevel}
              onChange={(e) => setFormLevel(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition"
              disabled={submitting}
            >
              <option value="">Select your form level</option>
              {FORM_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>

          {/* Subjects */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Subjects of Study <span className="text-red-500">*</span>
            </label>
            <p className="text-sm text-gray-500 mb-3">Type to search and select subjects you're currently studying</p>
            <SubjectMultiSelect
              selectedSubjects={selectedSubjects}
              onChange={setSelectedSubjects}
              disabled={submitting}
              placeholder="Type subject name (e.g. Mathematics, Physics)..."
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 focus:outline-none transition font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving...' : 'Complete Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}

