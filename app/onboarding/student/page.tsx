'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import { setUserSubjects } from '@/lib/supabase/userSubjects';
import { Institution } from '@/lib/hooks/useInstitutionsSearch';
import { ensureSchoolCommunityAndMembership } from '@/lib/actions/community';
import { PAID_CLASSES_DISABLED_MESSAGE } from '@/lib/featureFlags/paidClasses';

// ─── constants ───────────────────────────────────────────────────────────────

const FORM_LEVELS = ['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Lower 6', 'Upper 6'];

const TEACHING_LEVELS = ['SEA', 'Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'CAPE Unit 1', 'CAPE Unit 2'];

const SEA_SUBJECT_OPTIONS = [
  { label: 'SEA Maths', shortLabel: 'Maths' },
  { label: 'SEA English', shortLabel: 'English' },
  { label: 'SEA Creative Writing', shortLabel: 'Creative Writing' },
] as const;

const SEA_SUBJECT_LABELS: Set<string> = new Set(SEA_SUBJECT_OPTIONS.map((o) => o.label));

const SEA_NAME_BY_UI_LABEL: Record<string, string> = {
  'SEA Maths': 'SEA Mathematics',
  'SEA English': 'SEA English',
  'SEA Creative Writing': 'SEA Creative Writing',
};

type AccountRole = 'student' | 'tutor' | 'parent';
type Step = 'role' | 'student-form' | 'tutor-form';
type SchoolAffiliation = 'attend' | 'teach' | 'none' | null;

// ─── tutor subject resolver ───────────────────────────────────────────────────

async function resolveSubjectRowsForOnboarding(client: SupabaseClient, labels: string[]) {
  const unique = [...new Set(labels.filter(Boolean))];
  if (unique.length === 0) return { rows: [] as { id: string }[], error: 'No subjects selected.' };

  const { data: primary, error: e1 } = await client.from('subjects').select('id, label, name').in('label', unique);
  if (e1) return { rows: [], error: e1.message };

  const pool = [...(primary ?? [])];
  const missing = unique.filter((l) => !pool.some((r) => r.label === l));

  if (missing.length > 0) {
    const namesToTry = [...new Set(missing.map((l) => SEA_NAME_BY_UI_LABEL[l] ?? l))];
    const { data: byName, error: e2 } = await client.from('subjects').select('id, label, name').in('name', namesToTry);
    if (e2) return { rows: [], error: e2.message };
    for (const r of byName ?? []) {
      if (!pool.some((p) => p.id === r.id)) pool.push(r);
    }
  }

  const idsOrdered: { id: string }[] = [];
  for (const l of unique) {
    const row =
      pool.find((r) => r.label === l) ??
      pool.find((r) => r.name === (SEA_NAME_BY_UI_LABEL[l] ?? '')) ??
      pool.find((r) => r.name === l);
    if (!row) return { rows: [], error: `Could not find subject "${l}".` };
    idsOrdered.push({ id: row.id });
  }

  const deduped: { id: string }[] = [];
  const seen = new Set<string>();
  for (const r of idsOrdered) {
    if (!seen.has(r.id)) { seen.add(r.id); deduped.push(r); }
  }
  return { rows: deduped, error: null as string | null };
}

// ─── role cards ──────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { role: AccountRole; label: string; description: string; icon: React.ReactNode }[] = [
  {
    role: 'student',
    label: 'Student',
    description: 'I want to find tutors and book learning sessions.',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    role: 'tutor',
    label: 'iTutor',
    description: 'I want to teach students and offer tutoring sessions.',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    role: 'parent',
    label: 'Parent / Guardian',
    description: 'I want to manage bookings and oversee my child\'s learning.',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

// ─── main page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // step state
  const [step, setStep] = useState<Step>('role');
  const [selectedRole, setSelectedRole] = useState<AccountRole | null>(null);

  // student form state
  const [affiliation, setAffiliation] = useState<SchoolAffiliation>(null);
  const [studentInstitution, setStudentInstitution] = useState<Institution | null>(null);
  const [formLevel, setFormLevel] = useState('');
  const [studentSubjects, setStudentSubjects] = useState<string[]>([]);

  // tutor form state
  const [tutorInstitution, setTutorInstitution] = useState<Institution | null>(null);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedSeaSubjects, setSelectedSeaSubjects] = useState<string[]>([]);
  const [tutorSubjects, setTutorSubjects] = useState<string[]>([]);

  useEffect(() => {
    async function checkAuth() {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (!profile) { router.push('/login'); return; }

      setUserId(user.id);

      // Pre-select role if already set, and skip to the relevant form
      const existingRole = profile.role as AccountRole | null;
      if (existingRole === 'student') {
        setSelectedRole('student');
        setStep('student-form');
      } else if (existingRole === 'tutor') {
        setSelectedRole('tutor');
        setStep('tutor-form');
      } else if (existingRole === 'parent') {
        router.push('/parent/dashboard');
        return;
      }

      setLoading(false);
    }
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (affiliation === 'none') setStudentInstitution(null);
  }, [affiliation]);

  useEffect(() => {
    if (!selectedLevels.includes('SEA')) setSelectedSeaSubjects([]);
  }, [selectedLevels]);

  const hasNonSeaLevel = selectedLevels.some((l) => l !== 'SEA');

  useEffect(() => {
    if (!hasNonSeaLevel) setTutorSubjects((prev) => prev.filter((s) => SEA_SUBJECT_LABELS.has(s)));
  }, [hasNonSeaLevel]);

  const toggleLevel = useCallback((level: string) => {
    setSelectedLevels((prev) => prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]);
  }, []);

  const toggleSeaSubject = useCallback((label: string) => {
    setSelectedSeaSubjects((prev) => prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]);
  }, []);

  // ── role selection ──────────────────────────────────────────────────────────

  const handleRoleSelect = async (role: AccountRole) => {
    if (!userId || submitting) return;
    setError('');
    setSubmitting(true);

    try {
      const { error: updateError } = await supabase.from('profiles').update({ role }).eq('id', userId);
      if (updateError) { setError('Could not update your account type. Please try again.'); setSubmitting(false); return; }

      setSelectedRole(role);

      if (role === 'parent') {
        router.push('/parent/dashboard');
        return;
      }

      setStep(role === 'tutor' ? 'tutor-form' : 'student-form');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── student submit ──────────────────────────────────────────────────────────

  const handleStudentSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (affiliation === null) { setError('Please answer whether you are affiliated with a school.'); return; }
    if (!formLevel) { setError('Please select your form level.'); return; }
    if (studentSubjects.length === 0) { setError('Please select at least one subject.'); return; }

    setSubmitting(true);
    try {
      const showSchool = affiliation === 'attend' || affiliation === 'teach';
      const schoolUpdate = showSchool && studentInstitution
        ? { school: studentInstitution.name, institution_id: studentInstitution.id }
        : { school: null, institution_id: null };

      const { error: updateError } = await supabase.from('profiles')
        .update({ ...schoolUpdate, form_level: formLevel, subjects_of_study: studentSubjects })
        .eq('id', userId);

      if (updateError) { setError('Error updating profile. Please try again.'); setSubmitting(false); return; }

      const { error: subjectsError } = await setUserSubjects(userId!, studentSubjects);
      if (subjectsError) { setError('Error saving subjects. Please try again.'); setSubmitting(false); return; }

      const ensure = await ensureSchoolCommunityAndMembership(userId!);
      if (!ensure.success) { setError(ensure.error ?? 'Could not join school community.'); setSubmitting(false); return; }

      router.push('/student/dashboard');
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  };

  // ── tutor submit ────────────────────────────────────────────────────────────

  const handleTutorSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    const hasSea = selectedLevels.includes('SEA');
    const hasNonSea = selectedLevels.some((l) => l !== 'SEA');

    if (selectedLevels.length === 0) { setError('Please select at least one teaching level.'); return; }
    if (hasNonSea && tutorSubjects.length === 0) { setError('Please add at least one subject for CSEC/CAPE levels.'); return; }

    const seaCoveredByChips = selectedSeaSubjects.length > 0;
    const seaCoveredBySearch = tutorSubjects.some((s) => SEA_SUBJECT_LABELS.has(s));
    if (hasSea && !seaCoveredByChips && !seaCoveredBySearch) {
      setError('Please select at least one SEA subject (Maths, English, or Creative Writing).');
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.from('profiles')
        .update(tutorInstitution ? { school: tutorInstitution.name, institution_id: tutorInstitution.id } : { school: null, institution_id: null })
        .eq('id', userId);

      if (updateError) { setError(`Error updating profile: ${updateError.message}`); setSubmitting(false); return; }

      const allLabels = [...new Set([...tutorSubjects, ...selectedSeaSubjects])];

      if (allLabels.some((l) => SEA_SUBJECT_LABELS.has(l))) {
        const ensureRes = await fetch('/api/tutor/ensure-sea-subjects', { method: 'POST' });
        const ensureJson = await ensureRes.json().catch(() => null) as { ok?: boolean; hint?: string; error?: string } | null;
        if (!ensureJson?.ok) {
          setError(ensureJson?.hint || ensureJson?.error || 'SEA subjects are not available yet.');
          setSubmitting(false);
          return;
        }
      }

      const { rows: subjectRows, error: resolveError } = await resolveSubjectRowsForOnboarding(supabase, allLabels);
      if (resolveError || subjectRows.length === 0) { setError(resolveError || 'Could not load selected subjects. Please try again.'); setSubmitting(false); return; }

      const { error: deleteError } = await supabase.from('tutor_subjects').delete().eq('tutor_id', userId);
      if (deleteError) { setError('Error clearing previous subjects. Please try again.'); setSubmitting(false); return; }

      const flagsRes = await fetch('/api/feature-flags', { cache: 'no-store' });
      const flags = await flagsRes.json();
      const paidEnabled = Boolean(flags?.paidClassesEnabled);
      if (!paidEnabled) console.log(PAID_CLASSES_DISABLED_MESSAGE);

      const response = await fetch('/api/tutor/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects: subjectRows.map((s) => ({ subject_id: s.id, price_per_hour_ttd: 100, mode: 'either' })),
        }),
      });

      const result = await response.json();
      if (!response.ok) { setError(`Error saving subjects: ${result?.error || 'Unknown error'}`); setSubmitting(false); return; }

      const { data: savedSubjects, error: verifyError } = await supabase.from('tutor_subjects').select('id').eq('tutor_id', userId);
      if (verifyError || !savedSubjects || savedSubjects.length === 0) { setError('Subjects were not saved correctly. Please try again.'); setSubmitting(false); return; }

      const ensure = await ensureSchoolCommunityAndMembership(userId!);
      if (!ensure.success) { setError(ensure.error ?? 'Could not join school community.'); setSubmitting(false); return; }

      router.push('/tutor/dashboard');
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  };

  // ── loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-200 border-t-emerald-600" />
      </div>
    );
  }

  // ── shared wrapper ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 px-4 py-8 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-emerald-200/30 to-blue-200/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-purple-200/30 to-pink-200/30 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-8 max-w-2xl w-full relative border border-white/50">

        {/* ── Step 1: Role Selection ── */}
        {step === 'role' && (
          <>
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent mb-2">
                Welcome to iTutor!
              </h1>
              <p className="text-gray-600">How would you like to use iTutor?</p>
            </div>

            {error && (
              <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded-xl mb-6">
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            <div className="space-y-3">
              {ROLE_OPTIONS.map(({ role, label, description, icon }) => (
                <button
                  key={role}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleRoleSelect(role)}
                  className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/40 transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <div className="w-14 h-14 flex-shrink-0 rounded-xl bg-gradient-to-br from-emerald-100 to-blue-100 flex items-center justify-center text-emerald-600 group-hover:from-emerald-200 group-hover:to-blue-200 transition-colors">
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-base">{label}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{description}</p>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-emerald-500 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Step 2a: Student Form ── */}
        {step === 'student-form' && (
          <>
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent mb-2">
                Complete your student profile
              </h1>
              <p className="text-gray-600 text-sm">
                Tell iTutor about your form level and subjects. School is optional.
              </p>
            </div>

            <form onSubmit={handleStudentSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded-xl">
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              {/* School affiliation */}
              <div className="bg-slate-50/80 p-5 rounded-xl border border-slate-100">
                <fieldset>
                  <legend className="block text-sm font-semibold text-gray-800 mb-3">Are you affiliated with a school?</legend>
                  <div className="space-y-2">
                    {([
                      { value: 'attend', label: 'Yes, I attend a school' },
                      { value: 'teach', label: 'Yes, I teach at a school' },
                      { value: 'none', label: 'No, not affiliated with a school' },
                    ] as const).map(({ value, label }) => (
                      <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:border-emerald-300 cursor-pointer transition">
                        <input
                          type="radio"
                          name="schoolAffiliation"
                          value={value}
                          checked={affiliation === value}
                          onChange={() => setAffiliation(value)}
                          disabled={submitting}
                          className="h-4 w-4 text-emerald-600 border-gray-300 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-gray-800">{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>

              {/* School search */}
              {(affiliation === 'attend' || affiliation === 'teach') && (
                <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100/50">
                  <label className="block text-sm font-semibold text-gray-800 mb-2">School (optional)</label>
                  <InstitutionAutocomplete
                    selectedInstitution={studentInstitution}
                    onChange={setStudentInstitution}
                    filters={{ institution_level: 'secondary', country_code: 'TT' }}
                    disabled={submitting}
                    placeholder="Type to search (e.g. Queen's, Presentation, Naparima)..."
                    required={false}
                    hideDefaultHint
                  />
                </div>
              )}

              {/* Form level */}
              <div className="bg-emerald-50/50 p-5 rounded-xl border border-emerald-100/50">
                <label htmlFor="formLevel" className="block text-sm font-semibold text-gray-800 mb-2">
                  Form Level <span className="text-red-500">*</span>
                </label>
                <select
                  id="formLevel"
                  value={formLevel}
                  onChange={(e) => setFormLevel(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none transition bg-white"
                  disabled={submitting}
                >
                  <option value="">Select your form level</option>
                  {FORM_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              {/* Subjects */}
              <div className="bg-purple-50/50 p-5 rounded-xl border border-purple-100/50">
                <label className="block text-sm font-semibold text-gray-800 mb-1">
                  Subjects of Study <span className="text-red-500">*</span>
                </label>
                <p className="text-sm text-gray-500 mb-3">Search and select the subjects you&apos;re currently studying.</p>
                <SubjectMultiSelect
                  selectedSubjects={studentSubjects}
                  onChange={setStudentSubjects}
                  disabled={submitting}
                  placeholder="Type subject name (e.g. Mathematics, Physics)..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setStep('role'); setError(''); }}
                  disabled={submitting}
                  className="px-5 py-3 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-sm hover:border-gray-300 transition disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-blue-600 text-white py-3 px-6 rounded-xl font-bold text-base disabled:opacity-50 hover:from-emerald-600 hover:to-blue-700 transition-all shadow-lg shadow-emerald-500/30"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </span>
                  ) : 'Complete Profile'}
                </button>
              </div>
            </form>
          </>
        )}

        {/* ── Step 2b: Tutor Form ── */}
        {step === 'tutor-form' && (
          <>
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent mb-2">
                Set up your tutor profile
              </h1>
              <p className="text-gray-600 text-sm">
                Add your subjects and teaching levels so students can find you.
              </p>
            </div>

            <form onSubmit={handleTutorSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded-xl">
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              {/* School */}
              <div className="bg-emerald-50/50 p-5 rounded-xl border border-emerald-100/50">
                <label className="block text-sm font-semibold text-gray-800 mb-1">School (optional)</label>
                <p className="text-sm text-gray-500 mb-3">Search for your school, college, or university.</p>
                <InstitutionAutocomplete
                  selectedInstitution={tutorInstitution}
                  onChange={setTutorInstitution}
                  filters={{ country_code: 'TT' }}
                  disabled={submitting}
                  placeholder="Type to search (e.g. QRC, UWI, Presentation, COSTAATT)..."
                  required={false}
                  allowNoneOption
                  hideDefaultHint
                />
              </div>

              {/* Teaching levels */}
              <div className="bg-teal-50/50 p-5 rounded-xl border border-teal-100/50">
                <label className="block text-sm font-semibold text-gray-800 mb-1">
                  Teaching Levels <span className="text-red-500">*</span>
                </label>
                <p className="text-sm text-gray-500 mb-3">Select all levels you can teach, including SEA if applicable.</p>
                <div className="flex flex-wrap gap-2">
                  {TEACHING_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => toggleLevel(level)}
                      disabled={submitting}
                      className={`min-h-[40px] px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                        selectedLevels.includes(level)
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-emerald-500'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                {selectedLevels.length > 0 && (
                  <p className="text-sm text-emerald-700 font-medium mt-3">
                    ✓ {selectedLevels.length} level{selectedLevels.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              {/* SEA subjects */}
              {selectedLevels.includes('SEA') && (
                <div className="bg-amber-50/80 p-5 rounded-xl border border-amber-200/60">
                  <label className="block text-sm font-semibold text-gray-900 mb-1">
                    SEA subjects <span className="text-red-500">*</span>
                  </label>
                  <p className="text-sm text-gray-600 mb-3">Select the SEA subjects you teach.</p>
                  <div className="flex flex-wrap gap-2">
                    {SEA_SUBJECT_OPTIONS.map(({ label, shortLabel }) => {
                      const on = selectedSeaSubjects.includes(label);
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleSeaSubject(label)}
                          disabled={submitting}
                          className={`min-h-[40px] flex-1 min-w-[130px] px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                            on
                              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-500'
                              : 'bg-white text-gray-800 border-amber-200 hover:border-amber-400'
                          }`}
                        >
                          {shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CSEC / CAPE subjects */}
              {hasNonSeaLevel && (
                <div className="bg-blue-50/50 p-5 rounded-xl border border-blue-100/50">
                  <label className="block text-sm font-semibold text-gray-800 mb-1">
                    Subjects you can teach (CSEC / CAPE) <span className="text-red-500">*</span>
                  </label>
                  <p className="text-sm text-gray-500 mb-3">Search and add subjects for the secondary / CAPE levels selected above.</p>
                  <SubjectMultiSelect
                    selectedSubjects={tutorSubjects}
                    onChange={setTutorSubjects}
                    disabled={submitting}
                    placeholder="Type subject name (e.g. CSEC Math, CAPE Physics)..."
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setStep('role'); setError(''); }}
                  disabled={submitting}
                  className="px-5 py-3 rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-sm hover:border-gray-300 transition disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 px-6 rounded-xl font-bold text-base disabled:opacity-50 hover:from-emerald-600 hover:to-teal-700 transition-all shadow-lg shadow-emerald-500/30"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </span>
                  ) : 'Complete Profile'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
