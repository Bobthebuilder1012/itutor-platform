'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import { Institution } from '@/lib/hooks/useInstitutionsSearch';
import { PAID_CLASSES_DISABLED_MESSAGE } from '@/lib/featureFlags/paidClasses';
import { ensureSchoolCommunityAndMembership } from '@/lib/actions/community';

const TEACHING_LEVELS = [
  'SEA',
  'Form 1',
  'Form 2',
  'Form 3',
  'Form 4',
  'Form 5',
  'CAPE Unit 1',
  'CAPE Unit 2',
];

const SEA_SUBJECT_OPTIONS = [
  { label: 'SEA Maths', shortLabel: 'Maths' },
  { label: 'SEA English', shortLabel: 'English' },
  { label: 'SEA Creative Writing', shortLabel: 'Creative Writing' },
] as const;

const SEA_SUBJECT_LABELS: Set<string> = new Set(SEA_SUBJECT_OPTIONS.map((o) => o.label));

/** DB `name` for each chip label (migration 095 uses these names + labels). */
const SEA_NAME_BY_UI_LABEL: Record<string, string> = {
  'SEA Maths': 'SEA Mathematics',
  'SEA English': 'SEA English',
  'SEA Creative Writing': 'SEA Creative Writing',
};

async function resolveSubjectRowsForOnboarding(client: SupabaseClient, labels: string[]) {
  const unique = [...new Set(labels.filter(Boolean))];
  if (unique.length === 0) {
    return { rows: [] as { id: string }[], error: 'No subjects selected.' };
  }

  const { data: primary, error: e1 } = await client
    .from('subjects')
    .select('id, label, name')
    .in('label', unique);

  if (e1) {
    return { rows: [], error: e1.message };
  }

  const pool = [...(primary ?? [])];
  const missing = unique.filter((l) => !pool.some((r) => r.label != null && r.label === l));

  if (missing.length > 0) {
    const namesToTry = [...new Set(missing.map((l) => SEA_NAME_BY_UI_LABEL[l] ?? l))];
    const { data: byName, error: e2 } = await client.from('subjects').select('id, label, name').in('name', namesToTry);
    if (e2) {
      return { rows: [], error: e2.message };
    }
    for (const r of byName ?? []) {
      if (!pool.some((p) => p.id === r.id)) {
        pool.push(r);
      }
    }
  }

  const idsOrdered: { id: string }[] = [];
  for (const l of unique) {
    const row =
      pool.find((r) => r.label === l) ??
      pool.find((r) => r.name === (SEA_NAME_BY_UI_LABEL[l] ?? '')) ??
      pool.find((r) => r.name === l);
    if (!row) {
      const seaHint = unique.every((x) => SEA_SUBJECT_LABELS.has(x))
        ? ' Your project may be missing SEA rows in the database. In Supabase SQL editor, run migration 095_sea_subjects.sql (or ask your admin).'
        : '';
      return { rows: [], error: `Could not find subject “${l}”.${seaHint}` };
    }
    idsOrdered.push({ id: row.id });
  }

  const deduped: { id: string }[] = [];
  const seen = new Set<string>();
  for (const r of idsOrdered) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      deduped.push(r);
    }
  }

  return { rows: deduped, error: null as string | null };
}

export default function TutorOnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedSeaSubjects, setSelectedSeaSubjects] = useState<string[]>([]);
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

  useEffect(() => {
    if (!selectedLevels.includes('SEA')) {
      setSelectedSeaSubjects([]);
    }
  }, [selectedLevels]);

  const hasNonSeaLevel = selectedLevels.some((l) => l !== 'SEA');

  useEffect(() => {
    if (!hasNonSeaLevel) {
      setSelectedSubjects((prev) => prev.filter((s) => SEA_SUBJECT_LABELS.has(s)));
    }
  }, [hasNonSeaLevel]);

  const toggleSeaSubject = (label: string) => {
    setSelectedSeaSubjects((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  };

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

    const hasSea = selectedLevels.includes('SEA');
    const hasNonSea = selectedLevels.some((l) => l !== 'SEA');

    if (selectedLevels.length === 0) {
      setError('Please select at least one teaching level.');
      return;
    }

    if (hasNonSea && selectedSubjects.length === 0) {
      setError('Please add at least one subject for CSEC/CAPE levels (search above), or remove those levels.');
      return;
    }

    const seaCoveredByChips = selectedSeaSubjects.length > 0;
    const seaCoveredBySearch = selectedSubjects.some((s) => SEA_SUBJECT_LABELS.has(s));
    if (hasSea && !seaCoveredByChips && !seaCoveredBySearch) {
      setError(
        hasNonSea
          ? 'Please select at least one SEA subject using the Maths / English / Creative Writing buttons above, or add a SEA subject in the subject search.'
          : 'Please select at least one SEA subject (Maths, English, or Creative Writing).'
      );
      return;
    }

    setSubmitting(true);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update(
          selectedInstitution
            ? { school: selectedInstitution.name, institution_id: selectedInstitution.id }
            : { school: null, institution_id: null }
        )
        .eq('id', userId);

      if (updateError) {
        console.error('Profile update error:', updateError);
        setError(`Error updating profile: ${updateError.message}`);
        setSubmitting(false);
        return;
      }

      const allLabels = [...new Set([...selectedSubjects, ...selectedSeaSubjects])];

      const needsSeaRows = allLabels.some((l) => SEA_SUBJECT_LABELS.has(l));
      if (needsSeaRows) {
        const ensureRes = await fetch('/api/tutor/ensure-sea-subjects', { method: 'POST' });
        const ensureJson = (await ensureRes.json().catch(() => null)) as {
          ok?: boolean;
          hint?: string;
          error?: string;
        } | null;
        if (!ensureJson?.ok) {
          setError(
            ensureJson?.hint ||
              ensureJson?.error ||
              'SEA subjects are not available yet. Run migration 095_sea_subjects.sql in the Supabase SQL editor, or set SUPABASE_SERVICE_ROLE_KEY so the app can seed SEA rows.'
          );
          setSubmitting(false);
          return;
        }
      }

      const { rows: subjectRows, error: resolveError } = await resolveSubjectRowsForOnboarding(supabase, allLabels);

      if (resolveError || subjectRows.length === 0) {
        console.error('Subjects resolve error:', resolveError, 'labels:', allLabels);
        setError(resolveError || 'Could not load your selected subjects. Please try again.');
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
          subjects: subjectRows.map((subject) => ({
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
            Add your subjects and teaching levels—including SEA if you teach primary exit—so students can find you.
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
            <label className="block text-sm font-semibold text-gray-800 mb-2">School (optional)</label>
            <p className="text-sm text-gray-600 mb-3">
              Search for your school, college, or university. Type &quot;none&quot; to skip if you prefer not to list one.
            </p>
            <InstitutionAutocomplete
              selectedInstitution={selectedInstitution}
              onChange={setSelectedInstitution}
              filters={{ country_code: 'TT' }}
              disabled={submitting}
              placeholder="Type to search (e.g. QRC, UWI, Presentation, COSTAATT)..."
              required={false}
              allowNoneOption
              hideDefaultHint
            />
          </div>

          {/* Teaching Levels */}
          <div className="bg-gradient-to-br from-teal-50/50 to-emerald-50/50 p-5 sm:p-6 rounded-xl border border-teal-100/50">
            <label className="block text-sm font-semibold text-gray-800 mb-3">
              Teaching Levels <span className="text-red-500">*</span>
            </label>
            <p className="text-sm text-gray-600 mb-3">Select all levels you can teach, including SEA if applicable</p>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {TEACHING_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => toggleLevel(level)}
                  className={`min-h-[44px] px-4 sm:px-5 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all duration-200 shadow-sm touch-manipulation ${
                    selectedLevels.includes(level)
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-emerald-500 shadow-emerald-500/30 sm:scale-105'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400 hover:shadow-md active:scale-[0.98]'
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

          {/* SEA subjects (when SEA level selected) */}
          {selectedLevels.includes('SEA') && (
            <div className="bg-gradient-to-br from-amber-50/80 to-orange-50/50 p-5 sm:p-6 rounded-xl border border-amber-200/60">
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                SEA subjects <span className="text-red-500">*</span>
              </label>
              <p className="text-sm text-gray-600 mb-4">
                {hasNonSeaLevel
                  ? 'Tap the subjects you teach, or add the same SEA subjects using the CSEC / CAPE subject search below—they both count.'
                  : 'Tap the subjects you teach.'}
              </p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3">
                {SEA_SUBJECT_OPTIONS.map(({ label, shortLabel }) => {
                  const on = selectedSeaSubjects.includes(label);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleSeaSubject(label)}
                      disabled={submitting}
                      className={`min-h-[44px] flex-1 min-w-[140px] sm:min-w-[160px] px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all duration-200 touch-manipulation ${
                        on
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-500 shadow-md'
                          : 'bg-white text-gray-800 border-amber-200 hover:border-amber-400 active:scale-[0.98]'
                      }`}
                    >
                      {shortLabel}
                    </button>
                  );
                })}
              </div>
              {selectedSeaSubjects.length > 0 && (
                <p className="text-sm text-amber-800 font-medium mt-3">
                  {selectedSeaSubjects.length} SEA subject{selectedSeaSubjects.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          )}

          {/* CSEC / CAPE subjects — hidden when only SEA is selected as a level */}
          {hasNonSeaLevel && (
            <div className="bg-gradient-to-br from-blue-50/50 to-cyan-50/50 p-5 sm:p-6 rounded-xl border border-blue-100/50">
              <label className="block text-sm font-semibold text-gray-800 mb-3">
                Subjects you can teach (CSEC / CAPE) <span className="text-red-500">*</span>
              </label>
              <p className="text-sm text-gray-600 mb-3">
                Search and add subjects for the secondary / CAPE levels you selected above.
              </p>
              <SubjectMultiSelect
                selectedSubjects={selectedSubjects}
                onChange={setSelectedSubjects}
                disabled={submitting}
                placeholder="Type subject name (e.g. CSEC Math, CAPE Physics)..."
              />
            </div>
          )}

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

