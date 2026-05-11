'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, GraduationCap, Lightbulb, Loader2, UserRound, Users, X as XIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import { Institution } from '@/lib/hooks/useInstitutionsSearch';
import { setUserSubjects } from '@/lib/supabase/userSubjects';
import { ensureSchoolCommunityAndMembership } from '@/lib/actions/community';
import { cn } from '@/lib/utils';

type UserRole = 'student' | 'tutor' | 'parent';

const YEAR_LEVELS = [
  { value: 'SEA', label: 'SEA (10–11)' },
  { value: 'Form 1', label: 'Form 1 (11–12)' },
  { value: 'Form 2', label: 'Form 2 (12–13)' },
  { value: 'Form 3', label: 'Form 3 (13–14)' },
  { value: 'Form 4', label: 'Form 4 (14–15)' },
  { value: 'Form 5', label: 'Form 5 (15–16)' },
  { value: 'Lower 6', label: 'Lower 6 (16–17)' },
  { value: 'Upper 6', label: 'Upper 6 (17–18)' },
];

const TUTOR_LEVELS = [
  { value: 'sea', label: 'SEA' },
  { value: 'form-1', label: 'Form 1' },
  { value: 'form-2', label: 'Form 2' },
  { value: 'form-3', label: 'Form 3' },
  { value: 'form-4', label: 'Form 4' },
  { value: 'form-5', label: 'Form 5' },
  { value: 'cape-1', label: 'CAPE Unit 1' },
  { value: 'cape-2', label: 'CAPE Unit 2' },
];

const TUTOR_SUBJECT_LIST = [
  'CSEC Mathematics', 'CSEC Additional Mathematics', 'CSEC English A', 'CSEC English B',
  'CSEC Physics', 'CSEC Chemistry', 'CSEC Biology', 'CSEC Human & Social Biology',
  'CSEC Information Technology', 'CSEC Principles of Accounts', 'CSEC Principles of Business',
  'CSEC Economics', 'CSEC Geography', 'CSEC History', 'CSEC Spanish', 'CSEC French',
  'CSEC Social Studies', 'CSEC Religious Education',
  'CAPE Pure Mathematics', 'CAPE Applied Mathematics', 'CAPE Physics', 'CAPE Chemistry',
  'CAPE Biology', 'CAPE Computer Science', 'CAPE Economics', 'CAPE Accounting',
  'CAPE Management of Business', 'CAPE Sociology', 'CAPE Literatures in English',
  'CAPE Communication Studies', 'CAPE Caribbean Studies', 'CAPE Law', 'CAPE History',
  'CAPE Geography', 'SEA Mathematics', 'SEA English', 'SEA Creative Writing', 'SEA Science',
];

export default function CompleteRolePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState<'role' | 'profile'>('role');
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);

  // Student profile
  const [affiliation, setAffiliation] = useState<'attend' | 'teach' | 'no' | null>(null);
  const [studentInstitution, setStudentInstitution] = useState<Institution | null>(null);
  const [year, setYear] = useState('');

  // Tutor profile
  const [tLevels, setTLevels] = useState<string[]>([]);
  const [tSubjects, setTSubjects] = useState<string[]>([]);
  const [tQuery, setTQuery] = useState('');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      setUserId(user.id);

      // Ask the server to resolve role for this user (checks linked accounts by email)
      try {
        const res = await fetch('/api/auth/resolve-role', { method: 'POST' });
        const data = await res.json();
        // Only redirect if it's a real destination — never redirect back to this page
        if (data.redirect && !data.redirect.includes('complete-role')) {
          router.replace(data.redirect);
          return;
        }
        // Role already set but profile incomplete — skip role picker, go straight to profile form
        if (data.role && !data.redirect) {
          setRole(data.role as UserRole);
          if (data.role !== 'parent') {
            setStep('profile');
          } else {
            router.replace('/parent/dashboard');
            return;
          }
        }
      } catch { /* continue to show role picker */ }

      setCheckingSession(false);
    };
    init();
  }, [router]);

  const toggleLevel = (v: string) =>
    setTLevels((cur) => cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  const addTutorSubject = (s: string) => { if (!tSubjects.includes(s)) setTSubjects((c) => [...c, s]); setTQuery(''); };
  const removeTutorSubject = (s: string) => setTSubjects((c) => c.filter((x) => x !== s));
  const filteredTutorSubjects = useMemo(() =>
    TUTOR_SUBJECT_LIST.filter((s) => s.toLowerCase().includes(tQuery.toLowerCase()) && !tSubjects.includes(s)).slice(0, 8),
    [tQuery, tSubjects]);

  const saveProfile = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/auth/complete-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save profile');
    return data;
  };

  const handleRoleContinue = async () => {
    if (!role) { setError('Select a role to continue.'); return; }
    setError('');
    setLoading(true);
    try {
      await saveProfile({ role: 'set-role', newRole: role });
      if (role === 'parent') { router.push('/parent/dashboard'); return; }
      setStep('profile');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save role. Please try again.');
    } finally { setLoading(false); }
  };

  const handleStudentProfile = async () => {
    if (!affiliation) { setError('Select your school affiliation.'); return; }
    if (!year) { setError('Select your year level.'); return; }
    setError('');
    setLoading(true);
    try {
      const showSchool = affiliation === 'attend' || affiliation === 'teach';
      await saveProfile({
        role: 'student',
        form_level: year,
        school: showSchool && studentInstitution ? studentInstitution.name : null,
        institution_id: showSchool && studentInstitution ? studentInstitution.id : null,
      });
      if (showSchool && studentInstitution) await ensureSchoolCommunityAndMembership(userId!);
      router.push('/student/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
    } finally { setLoading(false); }
  };

  const handleTutorProfile = async () => {
    if (tLevels.length === 0) { setError('Select at least one teaching level.'); return; }
    const needsSubjects = tLevels.some((l) => l !== 'sea');
    if (needsSubjects && tSubjects.length === 0) { setError('Select at least one subject.'); return; }
    setError('');
    setLoading(true);
    try {
      await saveProfile({ role: 'tutor', teaching_levels: tLevels });
      if (tSubjects.length > 0) await setUserSubjects(userId!, tSubjects);
      router.push('/tutor/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred.');
    } finally { setLoading(false); }
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'linear-gradient(135deg, #071a0e 0%, #0d2318 50%, #0a1e14 100%)' }}>
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #071a0e 0%, #0d2318 50%, #0a1e14 100%)' }}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">

        {/* Dark header with logo */}
        <div className="flex items-center justify-center px-8 py-6" style={{ background: 'linear-gradient(135deg, #071a0e 0%, #0d2318 100%)' }}>
          <img src="/assets/logo/itutor-logo-new.png" alt="iTutor" className="h-12 w-auto object-contain" />
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <AnimatePresence mode="wait">

            {/* ROLE SELECTION */}
            {step === 'role' && (
              <motion.div key="role" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                <h2 className="font-display text-2xl font-bold tracking-tight">What brings you here?</h2>
                <p className="mt-1.5 text-sm text-gray-500">Pick what fits — you can adjust this later.</p>
                <div className="mt-6 space-y-3">
                  {([
                    { id: 'student' as UserRole, icon: <GraduationCap className="h-5 w-5" />, title: "I'm a student", desc: 'Find tutors and join lessons' },
                    { id: 'tutor' as UserRole, icon: <UserRound className="h-5 w-5" />, title: "I'm an iTutor", desc: 'Teach 1:1s and run lessons' },
                    { id: 'parent' as UserRole, icon: <Users className="h-5 w-5" />, title: "I'm a parent / guardian", desc: "Manage my child's learning" },
                  ]).map(({ id, icon, title, desc }) => (
                    <button key={id} type="button" onClick={() => { setRole(id); setError(''); }}
                      className={cn('flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition',
                        role === id ? 'border-itutor-green bg-green-50' : 'border-gray-200 bg-white hover:border-itutor-green/40')}>
                      <div className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                        role === id ? 'bg-itutor-green text-white' : 'bg-gray-100 text-gray-400')}>
                        {icon}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">{title}</div>
                        <div className="text-sm text-gray-500">{desc}</div>
                      </div>
                      <div className={cn('grid h-5 w-5 place-items-center rounded-full border-2 transition',
                        role === id ? 'border-itutor-green bg-itutor-green text-white' : 'border-gray-300')}>
                        {role === id && <Check className="h-3 w-3" strokeWidth={3} />}
                      </div>
                    </button>
                  ))}
                </div>
                <button onClick={handleRoleContinue} disabled={!role || loading}
                  className="mt-6 w-full rounded-xl bg-itutor-green py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                  {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Continue'}
                </button>
              </motion.div>
            )}

            {/* STUDENT PROFILE */}
            {step === 'profile' && role === 'student' && (
              <motion.div key="student-profile" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                <h2 className="font-display text-2xl font-bold tracking-tight">Tell us about your studies</h2>
                <p className="mt-1.5 text-sm text-gray-500">This helps us match you with the right tutors and lessons.</p>
                <div className="mt-6 space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Are you affiliated with a school?</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([{ v: 'attend', l: 'Yes, attend' }, { v: 'teach', l: 'Yes, teach' }, { v: 'no', l: 'No' }] as const).map((o) => (
                        <button key={o.v} type="button" onClick={() => { setAffiliation(o.v); setStudentInstitution(null); }}
                          className={cn('rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                            affiliation === o.v ? 'border-itutor-green bg-itutor-green text-white' : 'border-gray-200 hover:border-itutor-green/40')}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(affiliation === 'attend' || affiliation === 'teach') && (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">School <span className="text-gray-400 font-normal">(optional)</span></label>
                      <InstitutionAutocomplete
                        selectedInstitution={studentInstitution}
                        onChange={setStudentInstitution}
                        filters={{ institution_level: 'secondary' }}
                        disabled={loading}
                        placeholder="Type to search (e.g. PERS, Presentation, QRC)..."
                        required={false}
                        hideDefaultHint
                      />
                    </div>
                  )}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Year level <span className="text-red-500">*</span></label>
                    <select value={year} onChange={(e) => setYear(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-itutor-green focus:ring-2 focus:ring-green-100">
                      <option value="">Select your year</option>
                      {YEAR_LEVELS.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
                    </select>
                  </div>
                  <button onClick={handleStudentProfile} disabled={loading}
                    className="w-full rounded-xl bg-itutor-green py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                    {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Complete profile'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* TUTOR PROFILE */}
            {step === 'profile' && role === 'tutor' && (
              <motion.div key="tutor-profile" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                <div className="flex flex-col items-center text-center">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-itutor-green text-white shadow-lg">
                    <Lightbulb className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 font-display text-2xl font-bold">Set up your tutor profile</h2>
                  <p className="mt-1.5 text-sm text-gray-500">Add the levels you teach and your subjects.</p>
                </div>
                <div className="mt-6 space-y-5">
                  <div className="rounded-2xl p-4 ring-1 ring-itutor-green/20" style={{ backgroundColor: 'rgba(25,147,86,0.05)' }}>
                    <label className="text-sm font-semibold text-gray-800">Teaching Levels <span className="text-red-500">*</span></label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {TUTOR_LEVELS.map((l) => {
                        const active = tLevels.includes(l.value);
                        return (
                          <button key={l.value} type="button" onClick={() => toggleLevel(l.value)}
                            className={cn('rounded-full border px-4 py-1.5 text-sm font-semibold transition',
                              active ? 'border-itutor-green bg-itutor-green text-white' : 'border-gray-200 bg-white hover:border-itutor-green/40')}>
                            {l.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {tLevels.some((l) => l !== 'sea') && (
                    <div className="rounded-2xl border border-gray-200 bg-white p-4">
                      <label className="text-sm font-semibold text-gray-800">Subjects you can teach <span className="text-red-500">*</span></label>
                      <div className="relative mt-3">
                        <input value={tQuery} onChange={(e) => setTQuery(e.target.value)}
                          placeholder="Type subject name (e.g. CSEC Math, CAPE Physics)…"
                          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-itutor-green focus:ring-2 focus:ring-green-100" />
                        {tQuery.trim() && (
                          <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                            {filteredTutorSubjects.length === 0
                              ? <li className="px-3 py-2 text-sm text-gray-400">No matches</li>
                              : filteredTutorSubjects.map((s) => (
                                <li key={s}>
                                  <button type="button" onClick={() => addTutorSubject(s)}
                                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50">
                                    {s}<span className="text-xs text-gray-400">Add</span>
                                  </button>
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                      {tSubjects.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {tSubjects.map((s) => (
                            <span key={s} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium">
                              {s}
                              <button type="button" onClick={() => removeTutorSubject(s)} className="text-gray-400 hover:text-gray-700">
                                <XIcon className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <button onClick={handleTutorProfile} disabled={loading ||
                    tLevels.length === 0 || (tLevels.some((l) => l !== 'sea') && tSubjects.length === 0)}
                    className="w-full rounded-xl bg-itutor-green py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                    {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Complete Profile'}
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
