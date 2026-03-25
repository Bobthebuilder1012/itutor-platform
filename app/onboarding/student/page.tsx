'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import { setUserSubjects } from '@/lib/supabase/userSubjects';
import { Institution } from '@/lib/hooks/useInstitutionsSearch';
import { ensureSchoolCommunityAndMembership } from '@/lib/actions/community';

const FORM_LEVELS = ['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Lower 6', 'Upper 6'];

type SchoolAffiliation = 'attend' | 'teach' | 'none' | null;

const AFFILIATION_OPTIONS: { value: Exclude<SchoolAffiliation, null>; label: string }[] = [
  { value: 'attend', label: 'Yes, I attend a school' },
  { value: 'teach', label: 'Yes, I teach at a school' },
  { value: 'none', label: 'No, not affiliated with a school' },
];

export default function StudentOnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [affiliation, setAffiliation] = useState<SchoolAffiliation>(null);
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

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

      if (!profile || profile.role !== 'student') {
        router.push('/login');
        return;
      }

      setUserId(user.id);
      setLoading(false);
    }

    checkAuth();
  }, [router]);

  useEffect(() => {
    if (affiliation === 'none') {
      setSelectedInstitution(null);
    }
  }, [affiliation]);

  const showSchoolField = affiliation === 'attend' || affiliation === 'teach';

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (affiliation === null) {
      setError('Please answer whether you are affiliated with a school.');
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
      const schoolUpdate =
        showSchoolField && selectedInstitution
          ? { school: selectedInstitution.name, institution_id: selectedInstitution.id }
          : { school: null, institution_id: null };

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          ...schoolUpdate,
          form_level: formLevel,
          subjects_of_study: selectedSubjects,
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Profile update error:', updateError);
        setError('Error updating profile. Please try again.');
        setSubmitting(false);
        return;
      }

      const { error: subjectsError } = await setUserSubjects(userId!, selectedSubjects);

      if (subjectsError) {
        console.error('Subjects junction table error:', subjectsError);
        setError('Error saving subjects. Please try again.');
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

      router.push('/student/dashboard');
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-200 border-t-emerald-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 px-4 py-8 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-emerald-200/30 to-blue-200/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-purple-200/30 to-pink-200/30 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>

      <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-8 max-w-2xl w-full relative border border-white/50">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg transform hover:scale-105 transition-transform duration-200">
            <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent mb-3">
            Complete your student profile
          </h1>
          <p className="text-gray-700 text-lg">
            Tell iTutor about your form level and subjects. Add your school if you would like—it is optional.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded-xl shadow-sm">
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          <div className="bg-gradient-to-br from-slate-50/80 to-blue-50/50 p-6 rounded-xl border border-slate-100/80">
            <fieldset>
              <legend id="affiliation-legend" className="block text-sm font-semibold text-gray-800 mb-3">
                Are you affiliated with a school?
              </legend>
              <div className="space-y-2" role="radiogroup" aria-labelledby="affiliation-legend">
                {AFFILIATION_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-white/80 hover:border-emerald-300 cursor-pointer transition"
                  >
                    <input
                      type="radio"
                      name="schoolAffiliation"
                      value={value}
                      checked={affiliation === value}
                      onChange={() => setAffiliation(value)}
                      disabled={submitting}
                      className="mt-1 h-4 w-4 text-emerald-600 border-gray-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-gray-800">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          {showSchoolField && (
            <div className="bg-gradient-to-br from-blue-50/50 to-purple-50/50 p-6 rounded-xl border border-blue-100/50">
              <label className="block text-sm font-semibold text-gray-800 mb-2">School (optional)</label>
              <p className="text-sm text-gray-600 mb-3">
                Search for your school if you attend or teach at one. You can skip this if not applicable.
              </p>
              <InstitutionAutocomplete
                selectedInstitution={selectedInstitution}
                onChange={setSelectedInstitution}
                filters={{ institution_level: 'secondary', country_code: 'TT' }}
                disabled={submitting}
                placeholder="Type to search (e.g. Queen's, Presentation, Naparima)..."
                required={false}
                hideDefaultHint
              />
            </div>
          )}

          <div className="bg-gradient-to-br from-emerald-50/50 to-teal-50/50 p-6 rounded-xl border border-emerald-100/50">
            <label htmlFor="formLevel" className="block text-sm font-semibold text-gray-800 mb-2">
              Form Level <span className="text-red-500">*</span>
            </label>
            <select
              id="formLevel"
              value={formLevel}
              onChange={(e) => setFormLevel(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none transition bg-white shadow-sm hover:border-emerald-300"
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

          <div className="bg-gradient-to-br from-purple-50/50 to-pink-50/50 p-6 rounded-xl border border-purple-100/50">
            <label className="block text-sm font-semibold text-gray-800 mb-3">
              Subjects of Study <span className="text-red-500">*</span>
            </label>
            <p className="text-sm text-gray-600 mb-3">Type to search and select subjects you&apos;re currently studying</p>
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
            className="w-full bg-gradient-to-r from-emerald-500 to-blue-600 text-white py-4 px-6 rounded-xl hover:from-emerald-600 hover:to-blue-700 focus:ring-4 focus:ring-emerald-300 focus:outline-none transition-all duration-200 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/30 transform hover:scale-[1.02] active:scale-[0.98] mt-8"
          >
            {submitting ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
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
