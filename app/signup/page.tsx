'use client';

import { FormEvent, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Check, ChevronDown, Eye, EyeOff, GraduationCap,
  Loader2, Search, UserRound, Users, Lightbulb, X as XIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import { Institution } from '@/lib/hooks/useInstitutionsSearch';
import { setUserSubjects } from '@/lib/supabase/userSubjects';
import { ensureSchoolCommunityAndMembership } from '@/lib/actions/community';
import { cn } from '@/lib/utils';

type UserRole = 'student' | 'tutor' | 'parent';
type Step = 'details' | 'role' | 'verify' | 'confirmed' | 'profile';
type SchoolAffiliation = 'attend' | 'teach' | 'no';

const STEPS: { id: Step; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'role', label: 'Role' },
  { id: 'verify', label: 'Verify' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'profile', label: 'Profile' },
];

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

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message === 'Failed to fetch') return true;
  if (err instanceof Error && (err.message.includes('network') || err.message.includes('fetch'))) return true;
  return typeof navigator !== 'undefined' ? !navigator.onLine : false;
}

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>('details');
  const [userId, setUserId] = useState<string | null>(null);

  // Step 1
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(false);

  // Step 2
  const [role, setRole] = useState<UserRole | null>(null);

  // Step 3
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [resendIn, setResendIn] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Step 5 — student
  const [affiliation, setAffiliation] = useState<SchoolAffiliation | null>(null);
  const [studentInstitution, setStudentInstitution] = useState<Institution | null>(null);
  const [year, setYear] = useState('');

  // Step 5 — tutor
  const [tLevels, setTLevels] = useState<string[]>([]);
  const [tSubjects, setTSubjects] = useState<string[]>([]);
  const [tQuery, setTQuery] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Hash-based step navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const h = window.location.hash.replace('#', '') as Step;
    if (STEPS.some((s) => s.id === h)) setStep(h);
    const onPop = () => {
      const hash = window.location.hash.replace('#', '') as Step;
      if (STEPS.some((s) => s.id === hash)) setStep(hash);
      else setStep('details');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const goto = useCallback((s: Step) => {
    setStep(s);
    setError('');
    if (typeof window !== 'undefined') window.history.pushState(null, '', `#${s}`);
  }, []);

  // Resend cooldown
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // Real-time username check
  useEffect(() => {
    setUsernameError('');
    setUsernameAvailable(false);
    const trimmed = username.trim();
    if (!trimmed) return;
    if (trimmed.length < 3) { setUsernameError('Min 3 characters'); return; }
    if (trimmed.length > 30) { setUsernameError('Max 30 characters'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { setUsernameError('Letters, numbers and _ only'); return; }
    setUsernameChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/check-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: trimmed }),
        });
        const data = await res.json();
        if (data.usernameAvailable === false) setUsernameError('Username already taken');
        else setUsernameAvailable(true);
      } catch { /* ignore */ } finally { setUsernameChecking(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [username]);

  const usernameValid = /^[a-zA-Z0-9_]{3,30}$/.test(username) && !usernameError && usernameAvailable;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 8;
  const detailsValid = usernameValid && emailValid && !!country && passwordValid && agree;

  // ---- Step 1 ----
  const handleStep1 = async (e: FormEvent) => {
    e.preventDefault();
    if (!detailsValid) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username: username.trim() }),
      });
      const data = await res.json();
      if (!data.emailAvailable) { setError('Email already registered. Log in instead?'); return; }
      if (!data.usernameAvailable) { setError('Username already taken.'); return; }
    } catch (err) {
      setError(isNetworkError(err) ? 'Connect to the Internet' : 'An error occurred.');
      return;
    } finally { setLoading(false); }
    goto('role');
  };

  // ---- Step 2 ----
  const sendCode = async () => {
    setResendLoading(true);
    setResendIn(0);
    try {
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to send code.'); return; }
      setResendIn(60);
      setCode(['', '', '', '', '', '']);
    } catch (err) {
      setError(isNetworkError(err) ? 'Connect to the Internet' : 'Failed to send code.');
    } finally { setResendLoading(false); }
  };

  const handleStep2 = async () => {
    if (!role) { setError('Select a role to continue.'); return; }
    setError('');
    setLoading(true);
    await sendCode();
    setLoading(false);
    if (!error) goto('verify');
  };

  // ---- Step 3: Verify + Register ----
  const handleVerify = async () => {
    const joined = code.join('');
    if (joined.length !== 6) { setVerifyError('Enter all 6 digits.'); return; }
    setVerifyError('');
    setVerifying(true);

    try {
      const verifyRes = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: joined }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.valid) {
        setVerifyError(verifyData.expired
          ? 'Code expired. Click Resend to get a new one.'
          : `Invalid code. ${verifyData.attemptsRemaining ?? 0} attempts remaining.`);
        setVerifying(false);
        return;
      }
    } catch (err) {
      setVerifyError(isNetworkError(err) ? 'Connect to the Internet' : 'Verification failed.');
      setVerifying(false);
      return;
    }

    try {
      const regRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim().toLowerCase(),
          country,
          password,
          role,
          verificationCode: joined,
        }),
      });
      const regData = await regRes.json();
      if (!regRes.ok) { setVerifyError(regData.error || 'Registration failed.'); setVerifying(false); return; }
      setUserId(regData.user?.id || null);
      await supabase.auth.signInWithPassword({ email, password });
    } catch (err) {
      setVerifyError(isNetworkError(err) ? 'Connect to the Internet' : 'Registration failed.');
      setVerifying(false);
      return;
    }

    setVerifying(false);
    goto('confirmed');
    // Auto-advance from confirmed
    setTimeout(() => {
      if (role === 'student' || role === 'tutor') goto('profile');
      else {
        const redirectUrl = searchParams.get('redirect');
        router.push(redirectUrl ? decodeURIComponent(redirectUrl) : '/parent/coming-soon');
      }
    }, 1400);
  };

  // ---- Step 5: Student profile ----
  const handleStudentProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!affiliation) { setError('Select your school affiliation.'); return; }
    if (!year) { setError('Select your year level.'); return; }
    setError('');
    setLoading(true);
    try {
      const showSchool = affiliation === 'attend' || affiliation === 'teach';
      const { error: updateError } = await supabase.from('profiles')
        .update({
          school: showSchool && studentInstitution ? studentInstitution.name : null,
          institution_id: showSchool && studentInstitution ? studentInstitution.id : null,
          form_level: year,
        })
        .eq('id', userId);
      if (updateError) { setError(`Error saving profile: ${updateError.message}`); return; }

      if (showSchool && studentInstitution) await ensureSchoolCommunityAndMembership(userId!);
      const redirectUrl = searchParams.get('redirect');
      router.push(redirectUrl ? decodeURIComponent(redirectUrl) : '/student/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally { setLoading(false); }
  };

  // ---- Step 5: Tutor profile ----
  const handleTutorProfile = async () => {
    if (tLevels.length === 0) { setError('Select at least one teaching level.'); return; }
    const needsSubjects = tLevels.some((l) => l !== 'sea');
    if (needsSubjects && tSubjects.length === 0) { setError('Select at least one subject.'); return; }
    setError('');
    setLoading(true);
    try {
      await supabase.from('profiles').update({ teaching_levels: tLevels }).eq('id', userId);
      if (tSubjects.length > 0) await setUserSubjects(userId!, tSubjects);
      const redirectUrl = searchParams.get('redirect');
      router.push(redirectUrl ? decodeURIComponent(redirectUrl) : '/tutor/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally { setLoading(false); }
  };

  const toggleLevel = (v: string) =>
    setTLevels((cur) => cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  const addTutorSubject = (s: string) => { if (!tSubjects.includes(s)) setTSubjects((cur) => [...cur, s]); setTQuery(''); };
  const removeTutorSubject = (s: string) => setTSubjects((cur) => cur.filter((x) => x !== s));

  const filteredTutorSubjects = useMemo(() =>
    TUTOR_SUBJECT_LIST.filter((s) => s.toLowerCase().includes(tQuery.toLowerCase()) && !tSubjects.includes(s)).slice(0, 8),
    [tQuery, tSubjects]);

  return (
    <main className="min-h-screen text-white" style={{ background: 'linear-gradient(135deg, #071a0e 0%, #0d2318 50%, #0a1e14 100%)' }}>
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:flex-row lg:items-stretch lg:p-8">

        {/* LEFT — brand panel */}
        <aside className="hidden flex-col justify-between rounded-3xl p-10 lg:flex lg:w-[55%]" style={{ backgroundColor: 'oklch(0.16 0.04 155)' }}>
          <div>
            <img src="/assets/logo/itutor-logo-new.png" alt="iTutor" className="h-14 w-auto object-contain" />
          </div>
          <div className="space-y-8">
            <div>
              <h1 className="font-display text-5xl font-bold leading-tight tracking-tight">
                Learn with the<br />Caribbean's best tutors.
              </h1>
              <p className="mt-4 max-w-md text-white/70">
                Join thousands of students mastering SEA, CSEC and CAPE with verified iTutors.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[{ n: '1k+', l: 'Students' }, { n: '200+', l: 'Verified iTutors' }, { n: '4.9★', l: 'Avg rating' }].map((s) => (
                <div key={s.l} className="rounded-2xl p-4 ring-1 ring-white/10" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  <div className="font-display text-2xl font-bold text-itutor-green">{s.n}</div>
                  <div className="mt-1 text-xs text-white/60">{s.l}</div>
                </div>
              ))}
            </div>
            <ul className="space-y-3 text-sm text-white/80">
              {['Book 1:1s by the hour, or join recurring lessons', 'Verified subject qualifications on every iTutor', 'Cancel or reschedule with one tap'].map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(25,147,86,0.2)' }}>
                    <Check className="h-3 w-3 text-itutor-green" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-white/40">© iTutor 2026</p>
        </aside>

        {/* RIGHT — card */}
        <section className="flex-1 lg:w-[45%]">
          <div className="mx-auto flex h-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white text-gray-900 shadow-2xl">

            {/* Back to site link */}
            <div className="flex items-center justify-end px-5 py-3 border-b border-gray-100">
              <Link href="/" className="text-xs font-medium text-gray-400 hover:text-gray-600 transition">Back to site</Link>
            </div>

            {/* Progress */}
            <div className="px-6 pt-6 sm:px-8">
              <StepProgress current={step} />
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-8 pt-6 sm:px-8">

              {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <AnimatePresence mode="wait">

                {/* ===== STEP: DETAILS ===== */}
                {step === 'details' && (
                  <StepWrap key="details">
                    <StepHeader title="Create your account" sub="A few details to get started — you can change them later." />
                    <form onSubmit={handleStep1} className="mt-6 space-y-4">
                      <Field label="Username" hint={username && usernameError ? usernameError : undefined}
                        suffix={usernameChecking ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : usernameAvailable && username ? <Check className="h-4 w-4 text-itutor-green" /> : undefined}>
                        <input
                          type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                          placeholder="e.g. ramdeen_phys" autoComplete="username"
                          className={cn('w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition focus:ring-2',
                            usernameError ? 'border-red-400 focus:ring-red-200' : usernameAvailable && username ? 'border-itutor-green focus:ring-green-100' : 'border-gray-200 focus:border-itutor-green focus:ring-green-100')}
                          disabled={loading} required minLength={3} maxLength={30}
                        />
                      </Field>

                      <Field label="Email">
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com" autoComplete="email"
                          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-itutor-green focus:ring-2 focus:ring-green-100"
                          disabled={loading} required />
                      </Field>

                      <Field label="Country">
                        <CountryPicker value={country} onChange={setCountry} />
                      </Field>

                      <Field label="Password" hint={password && !passwordValid ? 'At least 8 characters' : undefined}>
                        <div className="relative">
                          <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                            placeholder="At least 8 characters" autoComplete="new-password"
                            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 pr-10 text-sm outline-none transition focus:border-itutor-green focus:ring-2 focus:ring-green-100"
                            disabled={loading} required />
                          <button type="button" onClick={() => setShowPw((s) => !s)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </Field>

                      <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-sm text-gray-500">
                        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-itutor-green focus:ring-itutor-green" />
                        <span>
                          I agree to the{' '}
                          <a href="/terms/student" target="_blank" className="font-medium text-gray-900 underline">Terms</a>{' '}
                          and{' '}
                          <a href="/terms/student" target="_blank" className="font-medium text-gray-900 underline">Privacy Policy</a>.
                        </span>
                      </label>

                      <button type="submit" disabled={!detailsValid || loading}
                        className="w-full rounded-xl bg-itutor-green py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                        {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Continue'}
                      </button>

                      <div className="relative py-1">
                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200" /></div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-white px-2 text-gray-400">or</span>
                        </div>
                      </div>

                      <GoogleButton redirectTo={`${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback?next=/signup/complete-role`} label="Continue with Google" />

                      <p className="pt-1 text-center text-sm text-gray-500">
                        Already have an account?{' '}
                        <Link href="/login" className="font-medium text-itutor-green underline">Log in</Link>
                      </p>
                    </form>
                  </StepWrap>
                )}

                {/* ===== STEP: ROLE ===== */}
                {step === 'role' && (
                  <StepWrap key="role">
                    <BackBtn onClick={() => goto('details')} />
                    <StepHeader title="What brings you here?" sub="Pick what fits — you can adjust this later." />
                    <div className="mt-6 space-y-3">
                      <RoleCard active={role === 'student'} onClick={() => setRole('student')}
                        icon={<GraduationCap className="h-5 w-5" />} title="I'm a student" desc="Find tutors and join lessons" />
                      <RoleCard active={role === 'tutor'} onClick={() => setRole('tutor')}
                        icon={<UserRound className="h-5 w-5" />} title="I'm an iTutor" desc="Teach 1:1s and run lessons" />
                      {/* Parent accounts — coming soon */}
                      <div className="relative rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 opacity-70 cursor-not-allowed select-none">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-muted p-2"><Users className="h-5 w-5 text-muted-foreground" /></div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                              I'm a parent / guardian
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Coming soon</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">Manage my child's learning</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button onClick={handleStep2} disabled={!role || loading}
                      className="mt-6 w-full rounded-xl bg-itutor-green py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                      {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Continue'}
                    </button>
                  </StepWrap>
                )}

                {/* ===== STEP: VERIFY ===== */}
                {step === 'verify' && (
                  <StepWrap key="verify">
                    <BackBtn onClick={() => goto('role')} />
                    <StepHeader
                      title="Check your email"
                      sub={<>We sent a 6-digit code to <span className="font-medium text-gray-900">{email}</span>.</>}
                    />
                    <div className="mt-6 space-y-4">
                      <OTPInputs value={code} onChange={setCode} onComplete={handleVerify} />
                      {verifyError && <p className="text-center text-sm text-red-500">{verifyError}</p>}
                      <button onClick={handleVerify} disabled={code.join('').length !== 6 || verifying}
                        className="w-full rounded-xl bg-itutor-green py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                        {verifying ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Verify & create account'}
                      </button>
                      <div className="text-center text-sm text-gray-500">
                        Didn&apos;t get it?{' '}
                        <button type="button" disabled={resendIn > 0 || resendLoading} onClick={sendCode}
                          className="font-medium text-itutor-green underline disabled:no-underline disabled:opacity-50">
                          {resendLoading ? 'Sending…' : resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                        </button>
                      </div>
                      <p className="text-center text-xs text-gray-400">
                        Emails can take up to a minute. Check spam if you don&apos;t see it.
                      </p>
                    </div>
                  </StepWrap>
                )}

                {/* ===== STEP: CONFIRMED ===== */}
                {step === 'confirmed' && (
                  <StepWrap key="confirmed">
                    <div className="flex flex-col items-center pt-6 text-center">
                      <motion.div
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 14 }}
                        className="grid h-20 w-20 place-items-center rounded-full text-itutor-green"
                        style={{ backgroundColor: 'rgba(25,147,86,0.12)' }}
                      >
                        <Check className="h-10 w-10" strokeWidth={3} />
                      </motion.div>
                      <h2 className="mt-5 font-display text-2xl font-bold">You&apos;re verified!</h2>
                      <p className="mt-2 max-w-sm text-sm text-gray-500">
                        {role === 'student'
                          ? 'One last step — tell us about your studies.'
                          : role === 'tutor'
                            ? 'One last step — set up your tutor profile.'
                            : 'Taking you to your dashboard…'}
                      </p>
                      {role === 'tutor' && (
                        <p className="mt-3 max-w-xs rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-600">
                          Credential verification is required before you can teach. You&apos;ll be guided through this next.
                        </p>
                      )}
                      <div className="mt-6 flex items-center gap-2 text-xs text-gray-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Redirecting…
                      </div>
                    </div>
                  </StepWrap>
                )}

                {/* ===== STEP: PROFILE — STUDENT ===== */}
                {step === 'profile' && role === 'student' && (
                  <StepWrap key="profile-student">
                    <StepHeader title="Tell us about your studies" sub="This helps us match you with the right tutors and lessons." />
                    <form onSubmit={handleStudentProfile} className="mt-6 space-y-5">
                      <Field label="Are you affiliated with a school?">
                        <div className="grid grid-cols-3 gap-2">
                      {([{ v: 'attend', l: 'Yes, attend' }, { v: 'teach', l: 'Yes, teach' }, { v: 'no', l: 'No' }] as const).map((o) => (
                          <button key={o.v} type="button" onClick={() => { setAffiliation(o.v); setStudentInstitution(null); }}
                            className={cn('rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                              affiliation === o.v ? 'border-itutor-green bg-itutor-green text-white' : 'border-gray-200 bg-white hover:border-itutor-green/40')}>
                            {o.l}
                          </button>
                        ))}
                      </div>
                    </Field>

                      {(affiliation === 'attend' || affiliation === 'teach') && (
                        <Field label="School (optional)">
                          <InstitutionAutocomplete
                            selectedInstitution={studentInstitution}
                            onChange={setStudentInstitution}
                            filters={{ institution_level: 'secondary' }}
                            disabled={loading}
                            placeholder="Type to search (e.g. PERS, Presentation, QRC)..."
                            required={false}
                            hideDefaultHint
                          />
                        </Field>
                      )}

                      <Field label="Year level *">
                        <select value={year} onChange={(e) => setYear(e.target.value)} disabled={loading}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-itutor-green focus:ring-2 focus:ring-green-100">
                          <option value="">Select your year</option>
                          {YEAR_LEVELS.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
                        </select>
                      </Field>

                      <button type="submit" disabled={loading}
                        className="w-full rounded-xl bg-itutor-green py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                        {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Complete profile'}
                      </button>
                    </form>
                  </StepWrap>
                )}

                {/* ===== STEP: PROFILE — TUTOR ===== */}
                {step === 'profile' && role === 'tutor' && (
                  <StepWrap key="profile-tutor">
                    <div className="flex flex-col items-center text-center">
                      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-itutor-green text-white shadow-lg">
                        <Lightbulb className="h-6 w-6" />
                      </div>
                      <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">Set up your tutor profile</h2>
                      <p className="mt-1.5 max-w-md text-sm text-gray-500">
                        Add the levels you teach and your subjects so students can find you.
                      </p>
                    </div>

                    <div className="mt-6 space-y-5">
                      <div className="rounded-2xl p-4 ring-1 ring-itutor-green/20" style={{ backgroundColor: 'rgba(25,147,86,0.05)' }}>
                        <label className="text-sm font-semibold text-gray-800">Teaching Levels <span className="text-red-500">*</span></label>
                        <p className="mt-0.5 text-xs text-gray-500">Select all levels you can teach.</p>
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
                          <p className="mt-0.5 text-xs text-gray-500">Search and add CSEC / CAPE subjects.</p>
                          <div className="relative mt-3">
                            <input value={tQuery} onChange={(e) => setTQuery(e.target.value)}
                              placeholder="Type subject name (e.g. CSEC Math, CAPE Physics)…"
                              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-itutor-green focus:ring-2 focus:ring-green-100" />
                            {tQuery.trim() && (
                              <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
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
                  </StepWrap>
                )}

              </AnimatePresence>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ─── Sub-components ─── */

function StepProgress({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s.id} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= idx ? 'bg-itutor-green' : 'bg-gray-200')} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {STEPS.map((s, i) => (
          <span key={s.id} className={cn(i === idx && 'text-itutor-green')}>{s.label}</span>
        ))}
      </div>
    </div>
  );
}

function StepWrap({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
      {children}
    </motion.div>
  );
}

function StepHeader({ title, sub }: { title: string; sub: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-1.5 text-sm text-gray-500">{sub}</p>
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="mb-3 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700">
      <ArrowLeft className="h-4 w-4" /> Back
    </button>
  );
}

function Field({ label, children, hint, suffix }: { label: string; children: React.ReactNode; hint?: string; suffix?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        {children}
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-red-500">{hint}</p>}
    </div>
  );
}

function RoleCard({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition',
        active ? 'border-itutor-green bg-green-50' : 'border-gray-200 bg-white hover:border-itutor-green/40')}>
      <div className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl',
        active ? 'bg-itutor-green text-white' : 'bg-gray-100 text-gray-400')}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="font-semibold text-gray-900">{title}</div>
        <div className="text-sm text-gray-500">{desc}</div>
      </div>
      <div className={cn('grid h-5 w-5 place-items-center rounded-full border-2 transition',
        active ? 'border-itutor-green bg-itutor-green text-white' : 'border-gray-300')}>
        {active && <Check className="h-3 w-3" strokeWidth={3} />}
      </div>
    </button>
  );
}

function OTPInputs({ value, onChange, onComplete }: { value: string[]; onChange: (v: string[]) => void; onComplete?: () => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const setAt = (i: number, ch: string) => {
    const next = [...value];
    next[i] = ch;
    onChange(next);
    if (ch && i < 5) refs.current[i + 1]?.focus();
    if (next.every((c) => c) && next.join('').length === 6) onComplete?.();
  };
  return (
    <div className="flex justify-center gap-2 sm:gap-3">
      {value.map((c, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric" maxLength={1} value={c}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(-1); setAt(i, v); }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus(); }}
          onPaste={(e) => {
            const txt = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (!txt) return;
            e.preventDefault();
            const next = txt.split('').concat(Array(6).fill('')).slice(0, 6);
            onChange(next);
            refs.current[Math.min(txt.length, 5)]?.focus();
            if (txt.length === 6) onComplete?.();
          }}
          className="h-14 w-11 rounded-xl border-2 border-gray-200 bg-white text-center text-xl font-semibold tabular-nums shadow-sm outline-none transition focus:border-itutor-green focus:ring-2 focus:ring-green-100 sm:h-16 sm:w-12 sm:text-2xl"
        />
      ))}
    </div>
  );
}

function CountryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Inline country data (ISO 3166-1 subset with flags)
  const COUNTRIES = [
    { code: 'TT', name: 'Trinidad and Tobago', flag: '🇹🇹' },
    { code: 'JM', name: 'Jamaica', flag: '🇯🇲' },
    { code: 'BB', name: 'Barbados', flag: '🇧🇧' },
    { code: 'GY', name: 'Guyana', flag: '🇬🇾' },
    { code: 'SR', name: 'Suriname', flag: '🇸🇷' },
    { code: 'LC', name: 'Saint Lucia', flag: '🇱🇨' },
    { code: 'VC', name: 'Saint Vincent and the Grenadines', flag: '🇻🇨' },
    { code: 'GD', name: 'Grenada', flag: '🇬🇩' },
    { code: 'DM', name: 'Dominica', flag: '🇩🇲' },
    { code: 'AG', name: 'Antigua and Barbuda', flag: '🇦🇬' },
    { code: 'KN', name: 'Saint Kitts and Nevis', flag: '🇰🇳' },
    { code: 'BS', name: 'Bahamas', flag: '🇧🇸' },
    { code: 'BZ', name: 'Belize', flag: '🇧🇿' },
    { code: 'HT', name: 'Haiti', flag: '🇭🇹' },
    { code: 'DO', name: 'Dominican Republic', flag: '🇩🇴' },
    { code: 'CU', name: 'Cuba', flag: '🇨🇺' },
    { code: 'US', name: 'United States', flag: '🇺🇸' },
    { code: 'CA', name: 'Canada', flag: '🇨🇦' },
    { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
    { code: 'NG', name: 'Nigeria', flag: '🇳🇬' },
    { code: 'GH', name: 'Ghana', flag: '🇬🇭' },
    { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
    { code: 'IN', name: 'India', flag: '🇮🇳' },
    { code: 'AU', name: 'Australia', flag: '🇦🇺' },
    { code: 'AF', name: 'Afghanistan', flag: '🇦🇫' },
    { code: 'AL', name: 'Albania', flag: '🇦🇱' },
    { code: 'DZ', name: 'Algeria', flag: '🇩🇿' },
    { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
    { code: 'AT', name: 'Austria', flag: '🇦🇹' },
    { code: 'AZ', name: 'Azerbaijan', flag: '🇦🇿' },
    { code: 'BD', name: 'Bangladesh', flag: '🇧🇩' },
    { code: 'BY', name: 'Belarus', flag: '🇧🇾' },
    { code: 'BE', name: 'Belgium', flag: '🇧🇪' },
    { code: 'BO', name: 'Bolivia', flag: '🇧🇴' },
    { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
    { code: 'BG', name: 'Bulgaria', flag: '🇧🇬' },
    { code: 'CM', name: 'Cameroon', flag: '🇨🇲' },
    { code: 'CL', name: 'Chile', flag: '🇨🇱' },
    { code: 'CN', name: 'China', flag: '🇨🇳' },
    { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
    { code: 'HR', name: 'Croatia', flag: '🇭🇷' },
    { code: 'CY', name: 'Cyprus', flag: '🇨🇾' },
    { code: 'CZ', name: 'Czechia', flag: '🇨🇿' },
    { code: 'DK', name: 'Denmark', flag: '🇩🇰' },
    { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
    { code: 'ET', name: 'Ethiopia', flag: '🇪🇹' },
    { code: 'FI', name: 'Finland', flag: '🇫🇮' },
    { code: 'FR', name: 'France', flag: '🇫🇷' },
    { code: 'DE', name: 'Germany', flag: '🇩🇪' },
    { code: 'GR', name: 'Greece', flag: '🇬🇷' },
    { code: 'HU', name: 'Hungary', flag: '🇭🇺' },
    { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
    { code: 'IE', name: 'Ireland', flag: '🇮🇪' },
    { code: 'IL', name: 'Israel', flag: '🇮🇱' },
    { code: 'IT', name: 'Italy', flag: '🇮🇹' },
    { code: 'JP', name: 'Japan', flag: '🇯🇵' },
    { code: 'JO', name: 'Jordan', flag: '🇯🇴' },
    { code: 'KE', name: 'Kenya', flag: '🇰🇪' },
    { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
    { code: 'LB', name: 'Lebanon', flag: '🇱🇧' },
    { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
    { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
    { code: 'MA', name: 'Morocco', flag: '🇲🇦' },
    { code: 'MM', name: 'Myanmar', flag: '🇲🇲' },
    { code: 'NP', name: 'Nepal', flag: '🇳🇵' },
    { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
    { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
    { code: 'NO', name: 'Norway', flag: '🇳🇴' },
    { code: 'PK', name: 'Pakistan', flag: '🇵🇰' },
    { code: 'PE', name: 'Peru', flag: '🇵🇪' },
    { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
    { code: 'PL', name: 'Poland', flag: '🇵🇱' },
    { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
    { code: 'RO', name: 'Romania', flag: '🇷🇴' },
    { code: 'RU', name: 'Russia', flag: '🇷🇺' },
    { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
    { code: 'SN', name: 'Senegal', flag: '🇸🇳' },
    { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
    { code: 'ES', name: 'Spain', flag: '🇪🇸' },
    { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰' },
    { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
    { code: 'CH', name: 'Switzerland', flag: '🇨🇭' },
    { code: 'TW', name: 'Taiwan', flag: '🇹🇼' },
    { code: 'TZ', name: 'Tanzania', flag: '🇹🇿' },
    { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
    { code: 'TR', name: 'Türkiye', flag: '🇹🇷' },
    { code: 'UG', name: 'Uganda', flag: '🇺🇬' },
    { code: 'UA', name: 'Ukraine', flag: '🇺🇦' },
    { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
    { code: 'UY', name: 'Uruguay', flag: '🇺🇾' },
    { code: 'VE', name: 'Venezuela', flag: '🇻🇪' },
    { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
    { code: 'ZM', name: 'Zambia', flag: '🇿🇲' },
    { code: 'ZW', name: 'Zimbabwe', flag: '🇿🇼' },
  ];

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selected = COUNTRIES.find((c) => c.code === value);
  const filtered = useMemo(() => {
    if (!q.trim()) return COUNTRIES;
    const s = q.toLowerCase();
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(s));
  }, [q]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-gray-200 px-3 text-sm shadow-sm transition hover:border-gray-300">
        <span className={cn('flex items-center gap-2', !selected && 'text-gray-400')}>
          {selected ? <><span className="text-base">{selected.flag}</span>{selected.name}</> : 'Select your country'}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search countries…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0
              ? <li className="px-3 py-2 text-sm text-gray-400">No matches</li>
              : filtered.map((c) => (
                <li key={c.code}>
                  <button type="button" onClick={() => { onChange(c.code); setOpen(false); setQ(''); }}
                    className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50', value === c.code && 'bg-gray-50')}>
                    <span className="text-base">{c.flag}</span>
                    <span className="flex-1">{c.name}</span>
                    {value === c.code && <Check className="h-4 w-4 text-itutor-green" />}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GoogleButton({ redirectTo, label }: { redirectTo: string; label: string }) {
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState('');

  const handleClick = async () => {
    setOauthLoading(true);
    setOauthError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { access_type: 'offline', prompt: 'consent' } },
    });
    if (error) { setOauthError('Failed to connect with Google. Please try again.'); setOauthLoading(false); }
  };

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={oauthLoading}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50">
        {oauthLoading
          ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
          : <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.44.35-2.1V7.07H2.18a11 11 0 0 0 0 9.87l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>}
        {oauthLoading ? 'Connecting…' : label}
      </button>
      {oauthError && <p className="mt-1.5 text-center text-xs text-red-500">{oauthError}</p>}
    </div>
  );
}
