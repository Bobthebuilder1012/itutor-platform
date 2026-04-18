'use client';

import { FormEvent, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import CountrySelect from '@/components/CountrySelect';
import SocialLoginButton from '@/components/SocialLoginButton';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import { setUserSubjects } from '@/lib/supabase/userSubjects';
import { Institution } from '@/lib/hooks/useInstitutionsSearch';
import { ensureSchoolCommunityAndMembership } from '@/lib/actions/community';

type UserRole = 'student' | 'tutor' | 'parent';
type Step = 1 | 2 | 3 | 4 | 5;
type SchoolAffiliation = 'attend' | 'teach' | 'none' | null;

const STEP_LABELS = ['Details', 'Role', 'Verify', 'Confirmed', 'Profile'];
const FORM_LEVELS = ['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Lower 6', 'Upper 6'];

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === 'Failed to fetch') return true;
  if (error instanceof Error && (error.message.includes('network') || error.message.includes('Network') || error.message.includes('fetch'))) return true;
  return typeof navigator !== 'undefined' ? !navigator.onLine : false;
}

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>(1);
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(false);

  const [verificationCode, setVerificationCode] = useState<string[]>(Array(8).fill(''));
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Step 5: Profile state
  const [affiliation, setAffiliation] = useState<SchoolAffiliation>(null);
  const [studentInstitution, setStudentInstitution] = useState<Institution | null>(null);
  const [formLevel, setFormLevel] = useState('');
  const [studentSubjects, setStudentSubjects] = useState<string[]>([]);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    const stepMap: Record<string, Step> = { details: 1, role: 2, verify: 3, confirmed: 4, profile: 5 };
    if (stepMap[hash]) setStep(stepMap[hash]);

    const onPop = () => {
      const h = window.location.hash.replace('#', '');
      if (stepMap[h]) setStep(stepMap[h]);
      else setStep(1);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const goStep = useCallback((s: Step) => {
    const names = ['', 'details', 'role', 'verify', 'confirmed', 'profile'];
    window.history.pushState(null, '', `#${names[s]}`);
    setStep(s);
    setError('');
  }, []);

  useEffect(() => {
    setUsernameError('');
    setUsernameAvailable(false);
    const trimmed = username.trim();
    if (!trimmed) return;
    if (trimmed.length < 3) { setUsernameError('Min 3 characters'); return; }
    if (trimmed.length > 30) { setUsernameError('Max 30 characters'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { setUsernameError('Letters, numbers, _ only'); return; }

    setUsernameChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/check-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: trimmed }),
        });
        const data = await res.json();
        if (data.usernameAvailable === false) setUsernameError('Username taken');
        else setUsernameAvailable(true);
      } catch { /* ignore */ } finally { setUsernameChecking(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [username]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCooldown]);

  useEffect(() => {
    if (affiliation === 'none') setStudentInstitution(null);
  }, [affiliation]);

  // --- Step 1 ---
  const handleStep1 = async () => {
    setError('');
    if (!fullName.trim() || fullName.trim().length < 2) { setError('Name must be at least 2 characters.'); return; }
    if (usernameError || !usernameAvailable) { setError('Choose a valid available username.'); return; }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email.'); return; }
    if (!countryCode) { setError('Select your country.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!termsAccepted) { setError('Accept Terms & Conditions.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username: username.trim() }),
      });
      const data = await res.json();
      if (!data.emailAvailable) { setError('Email already registered. Log in instead?'); setLoading(false); return; }
      if (!data.usernameAvailable) { setError('Username already taken.'); setLoading(false); return; }
    } catch (err) {
      setError(isNetworkError(err) ? 'Connect to the Internet' : 'An error occurred.');
      setLoading(false);
      return;
    }
    setLoading(false);
    goStep(2);
  };

  // --- Step 2 ---
  const handleStep2 = async () => {
    if (!role) { setError('Select a role to continue.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to send code.'); setLoading(false); return; }
      setResendCooldown(60);
    } catch (err) {
      setError(isNetworkError(err) ? 'Connect to the Internet' : 'Failed to send verification code.');
      setLoading(false);
      return;
    }
    setLoading(false);
    goStep(3);
  };

  // --- Resend ---
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResendLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to resend.'); }
      else { setResendCooldown(60); setVerificationCode(Array(8).fill('')); }
    } catch { setError('Failed to resend code.'); }
    finally { setResendLoading(false); }
  };

  // --- Code input ---
  const handleCodeInput = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...verificationCode];
    next[i] = val.slice(-1);
    setVerificationCode(next);
    if (val && i < 7) codeRefs.current[i + 1]?.focus();
  };
  const handleCodeKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !verificationCode[i] && i > 0) codeRefs.current[i - 1]?.focus();
  };
  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8);
    if (!text) return;
    const next = Array(8).fill('');
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setVerificationCode(next);
    codeRefs.current[Math.min(text.length, 7)]?.focus();
  };

  // --- Step 3: Verify + Register ---
  const handleVerify = async () => {
    const code = verificationCode.join('');
    if (code.length !== 8) { setError('Enter the full 8-digit code.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!data.valid) {
        setError(data.expired ? 'Code expired. Click Resend to get a new code.' : `Invalid code. ${data.attemptsRemaining ?? 0} attempts remaining.`);
        setLoading(false);
        return;
      }
    } catch (err) {
      setError(isNetworkError(err) ? 'Connect to the Internet' : 'Verification failed.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName.trim(), username: username.trim(), email: email.trim().toLowerCase(),
          country: countryCode, password, role, verificationCode: verificationCode.join(''),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Registration failed.'); setLoading(false); return; }
      setUserId(data.user?.id || null);
      await supabase.auth.signInWithPassword({ email, password });
    } catch (err) {
      setError(isNetworkError(err) ? 'Connect to the Internet' : 'Registration failed.');
      setLoading(false);
      return;
    }
    setLoading(false);
    goStep(4);
  };

  // --- Step 5: Profile submit ---
  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (affiliation === null) { setError('Select whether you are affiliated with a school.'); return; }
    if (!formLevel) { setError('Select your form level.'); return; }
    if (studentSubjects.length === 0) { setError('Select at least one subject.'); return; }

    setLoading(true);
    try {
      const showSchool = affiliation === 'attend' || affiliation === 'teach';
      const schoolUpdate = showSchool && studentInstitution
        ? { school: studentInstitution.name, institution_id: studentInstitution.id }
        : { school: null, institution_id: null };

      const { error: updateError } = await supabase.from('profiles')
        .update({ ...schoolUpdate, form_level: formLevel, subjects_of_study: studentSubjects })
        .eq('id', userId);

      if (updateError) { setError(`Error updating profile: ${updateError.message}`); setLoading(false); return; }

      const { error: subjectsError } = await setUserSubjects(userId!, studentSubjects);
      if (subjectsError) { setError('Error saving subjects.'); setLoading(false); return; }

      const ensure = await ensureSchoolCommunityAndMembership(userId!);
      if (!ensure.success) { setError(ensure.error ?? 'Could not join school community.'); setLoading(false); return; }

      router.push('/student/dashboard');
    } catch (err) {
      console.error('Profile completion error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setLoading(false);
    }
  };

  // --- Step 4: route to Step 5 or dashboard ---
  const handleBuildProfile = () => {
    if (role === 'student') { goStep(5); return; }
    const redirectUrl = searchParams.get('redirect');
    if (redirectUrl) { router.push(decodeURIComponent(redirectUrl)); return; }
    if (role === 'tutor') router.push('/tutor/dashboard');
    else if (role === 'parent') router.push('/parent/dashboard');
    else router.push('/');
  };

  const inputWithIcon = 'w-full bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400 text-sm py-2.5 pl-10 pr-4';
  const inputBase = 'w-full bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400 text-sm py-2.5 px-4';

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #071a0e 0%, #0d2318 50%, #0a1e14 100%)' }}>
      {/* LEFT PANEL */}
      <div className="hidden lg:flex lg:w-[55%] flex-col justify-center px-24 py-12 items-center relative overflow-hidden">
        <div className="absolute top-[-60px] right-[-60px] w-80 h-80 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(25,147,86,0.18) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[40px] left-[-60px] w-64 h-64 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(25,147,86,0.10) 0%, transparent 70%)' }} />
        <div className="flex flex-col w-full max-w-lg">
          <div className="mb-12">
            <img src="/assets/logo/itutor-logo-dark.png" alt="iTutor" className="h-24 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
          </div>
          <div className="inline-flex mb-6">
            <span className="px-4 py-1.5 rounded-full text-sm font-semibold tracking-wide" style={{ color: '#5dcea0', border: '1px solid rgba(25,147,86,0.45)', backgroundColor: 'rgba(25,147,86,0.15)' }}>
              ✦ CARIBBEAN&apos;S #1 TUTORING PLATFORM
            </span>
          </div>
          <h1 className="text-[3.25rem] font-extrabold text-white leading-tight mb-6">
            Find your<br />
            <span style={{ color: '#2ecc7a' }} className="whitespace-nowrap">perfect tutor,</span><br />
            ace every subject.
          </h1>
          <div className="flex gap-3 mb-8">
            {[
              { value: '100+', label: 'Expert Tutors' },
              { value: '50+', label: 'Subjects' },
              { value: '4.9★', label: 'Avg. Rating' },
              { value: '200+', label: 'Students' },
            ].map(({ value, label }) => (
              <div key={label} className="flex flex-col items-center justify-center rounded-xl px-4 py-3 backdrop-blur-md" style={{ background: 'rgba(25,147,86,0.15)', border: '1px solid rgba(46,204,122,0.30)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(25,147,86,0.12)', minWidth: '78px' }}>
                <span className="text-xl font-extrabold leading-none" style={{ color: '#2ecc7a' }}>{value}</span>
                <span className="text-[10px] mt-1 text-center leading-tight" style={{ color: 'rgba(180,230,200,0.70)' }}>{label}</span>
              </div>
            ))}
          </div>
          <p className="text-base mb-8 leading-relaxed" style={{ color: 'rgba(180,230,200,0.70)' }}>
            Get matched with top-rated verified iTutors.<br />CSEC, CAPE &amp; beyond — all in one platform.
          </p>
          <div className="space-y-3">
            {[
              { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />, title: '1-on-1 Live Sessions', desc: 'Real-time tutoring, any time you need' },
              { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />, title: 'Track Your Progress', desc: 'Visual dashboards & session history' },
              { icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />, title: 'Flexible Scheduling', desc: 'Book sessions around your timetable' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex items-center gap-4 rounded-xl px-5 py-3" style={{ backgroundColor: 'rgba(25,147,86,0.10)', border: '1px solid rgba(25,147,86,0.18)' }}>
                <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(25,147,86,0.25)' }}>
                  <svg className="w-5 h-5" style={{ color: '#2ecc7a' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
                </span>
                <div>
                  <p className="text-white text-base font-semibold">{title}</p>
                  <p className="text-sm" style={{ color: 'rgba(180,230,200,0.65)' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full lg:w-[45%] flex items-center justify-center px-6 py-6 relative z-10">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] px-8 py-6 max-h-[calc(100vh-48px)] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}>

          {/* Step Indicator — 5 dots */}
          <div className="flex items-center gap-0 mb-1 px-1">
            {[1, 2, 3, 4, 5].map((s, i) => (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className={`transition-all rounded-full ${s < step ? 'w-2.5 h-2.5 bg-itutor-green' : s === step ? 'w-6 h-2.5 bg-itutor-green rounded-md' : 'w-2.5 h-2.5 bg-gray-200'}`} />
                {i < 4 && <div className={`flex-1 h-0.5 mx-1 transition-colors ${s < step ? 'bg-itutor-green' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
          <div className="flex justify-between mb-5 px-0.5">
            {STEP_LABELS.map((l, i) => (
              <span key={l} className={`text-[10px] transition-colors ${i + 1 <= step ? 'text-itutor-green font-semibold' : 'text-gray-300'}`}>{l}</span>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg mb-3">
              <p className="text-xs">{error}</p>
            </div>
          )}

          {/* ===== STEP 1: DETAILS ===== */}
          {step === 1 && (
            <>
              <div className="text-center mb-3">
                <h2 className="text-lg font-bold text-gray-900 mb-0.5">Create your account</h2>
                <p className="text-xs text-gray-500">Sign up for your iTutor account</p>
              </div>

              <div className="mb-3">
                <SocialLoginButton provider="google" mode="signup" redirectTo="/auth/callback?next=/signup/complete-role" />
              </div>

              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-[10px] text-gray-400 font-medium tracking-wider">OR CONTINUE WITH EMAIL</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <form onSubmit={(e: FormEvent) => { e.preventDefault(); handleStep1(); }} className="space-y-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </span>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputWithIcon} placeholder="Full name" required disabled={loading} />
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
                  </span>
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                    className={`${inputWithIcon} pr-10 ${usernameError ? 'border-red-400 focus:ring-red-400' : usernameAvailable && username ? 'border-itutor-green' : ''}`}
                    placeholder="Username" required disabled={loading} minLength={3} maxLength={30} />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameChecking ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-itutor-green" />
                    ) : usernameError ? (
                      <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                    ) : usernameAvailable && username ? (
                      <svg className="w-4 h-4 text-itutor-green" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    ) : null}
                  </div>
                </div>
                {usernameError && <p className="text-[11px] text-red-400 -mt-1">{usernameError}</p>}

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputWithIcon} placeholder="you@example.com" required disabled={loading} />
                </div>

                <CountrySelect value={countryCode} onChange={setCountryCode} disabled={loading}
                  className={`w-full bg-white border border-gray-200 text-sm py-2.5 px-4 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition ${!countryCode ? 'text-gray-400' : 'text-gray-900'} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`} />

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0">Password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                      className={`${inputBase} pr-14`} placeholder="At least 8 characters" required disabled={loading} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 hover:text-gray-700 font-medium" tabIndex={-1}>
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0">Confirm password</label>
                  <div className="relative">
                    <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`${inputBase} pr-14`} placeholder="Re-enter your password" required disabled={loading} />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 hover:text-gray-700 font-medium" tabIndex={-1}>
                      {showConfirmPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <input type="checkbox" id="terms" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-itutor-green rounded focus:ring-itutor-green border-gray-300" required disabled={loading} />
                  <label htmlFor="terms" className="text-xs text-gray-500 leading-relaxed">
                    I agree to the <a href="/terms/student" target="_blank" className="text-itutor-green font-medium hover:underline">Terms & Conditions</a>
                  </label>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full bg-itutor-green hover:bg-emerald-700 text-white py-2.5 rounded-lg font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? 'Checking...' : 'Continue'}
                </button>
              </form>

              <div className="mt-2 text-center space-y-1">
                <p className="text-xs text-gray-600">Already have an account? <a href="/login" className="font-bold text-gray-900 hover:text-itutor-green transition-colors">Log in</a></p>
                <p className="text-[11px] text-gray-400">Signing up for your child? <a href="/signup/parent" className="text-itutor-green font-medium hover:underline">Parent/guardian signup</a></p>
              </div>
            </>
          )}

          {/* ===== STEP 2: ROLE ===== */}
          {step === 2 && (
            <>
              <div className="text-center mb-4">
                <h2 className="text-lg font-bold text-gray-900 mb-0.5">I am a...</h2>
                <p className="text-xs text-gray-500">Choose how you&apos;ll use iTutor</p>
              </div>

              <div className="flex flex-col gap-2.5 mb-4">
                {([
                  { id: 'student' as UserRole, name: 'Student', desc: 'I want to find tutors and join classes', color: 'bg-blue-50 text-blue-600', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /> },
                  { id: 'tutor' as UserRole, name: 'Tutor', desc: 'I want to teach and create classes', color: 'bg-emerald-50 text-emerald-600', icon: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 2v2" /><circle cx="9" cy="7" r="4" strokeWidth={1.8} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></> },
                  { id: 'parent' as UserRole, name: 'Parent / Guardian', desc: 'I want to manage my child\'s learning', color: 'bg-violet-50 text-violet-600', icon: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 2v2" /><circle cx="12" cy="7" r="4" strokeWidth={1.8} /></> },
                ]).map(({ id, name, desc, color, icon }) => (
                  <button key={id} type="button" onClick={() => { setRole(id); setError(''); }}
                    className={`flex items-center gap-3.5 p-4 border-2 rounded-xl transition-all text-left ${role === id ? 'border-itutor-green bg-green-50' : 'border-gray-200 hover:border-itutor-green hover:bg-green-50/30'}`}>
                    <span className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{name}</p>
                      <p className="text-[11px] text-gray-500">{desc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${role === id ? 'border-itutor-green bg-itutor-green' : 'border-gray-300'}`}>
                      {role === id && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                  </button>
                ))}
              </div>

              <button onClick={handleStep2} disabled={!role || loading}
                className="w-full bg-itutor-green hover:bg-emerald-700 text-white py-2.5 rounded-lg font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {loading ? 'Sending code...' : 'Continue'}
              </button>
              <button onClick={() => goStep(1)} className="w-full mt-2 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors">Back</button>
            </>
          )}

          {/* ===== STEP 3: VERIFY ===== */}
          {step === 3 && (
            <>
              <div className="text-center mb-4">
                <div className="mx-auto w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900 mb-0.5">Verify your email</h2>
                <p className="text-xs text-gray-500">Enter the 8-digit code we sent to your email</p>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">Email address</label>
                <input type="email" value={email} readOnly className={`${inputBase} bg-gray-50 text-gray-500`} />
              </div>

              <div className="flex gap-1.5 justify-center mb-2" onPaste={handleCodePaste}>
                {verificationCode.map((d, i) => (
                  <input key={i} ref={(el) => { codeRefs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={d}
                    onChange={(e) => handleCodeInput(i, e.target.value)} onKeyDown={(e) => handleCodeKeyDown(i, e)}
                    className="w-10 h-12 border-2 border-gray-200 rounded-lg text-center text-xl font-bold outline-none transition-all focus:border-itutor-green focus:ring-2 focus:ring-green-100"
                    disabled={loading} />
                ))}
              </div>

              <div className="text-center text-xs text-gray-500 mb-3">
                Didn&apos;t receive the code?{' '}
                <button type="button" onClick={handleResend} disabled={resendCooldown > 0 || resendLoading}
                  className="text-itutor-green font-semibold hover:underline disabled:opacity-50 disabled:cursor-not-allowed">
                  {resendLoading ? 'Sending...' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                </button>
              </div>

              <div className="rounded-lg px-3 py-2.5 mb-3" style={{ backgroundColor: 'rgba(25,147,86,0.06)', border: '1px solid rgba(25,147,86,0.15)' }}>
                <p className="text-[11px] text-gray-500"><span className="font-semibold text-gray-600">Note:</span> Organization/company email systems may delay delivery by 5–30 minutes. Check your spam folder.</p>
              </div>

              <button onClick={handleVerify} disabled={loading || verificationCode.join('').length !== 8}
                className="w-full bg-itutor-green hover:bg-emerald-700 text-white py-2.5 rounded-lg font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                    Creating account...
                  </span>
                ) : 'Verify & Create Account'}
              </button>
              <button onClick={() => goStep(2)} disabled={loading} className="w-full mt-2 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors disabled:opacity-50">Back</button>
            </>
          )}

          {/* ===== STEP 4: CONFIRMED ===== */}
          {step === 4 && (
            <div className="py-4 text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Account verified!</h2>
              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                Your account has been created successfully.<br />
                {role === 'student' ? 'One last step — tell us about your studies.' : 'Welcome to iTutor — let\u2019s get started.'}
              </p>
              {role === 'tutor' && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                  Credential verification is required before you can teach. You&apos;ll be guided through this next.
                </p>
              )}
              <button onClick={handleBuildProfile}
                className="w-full bg-itutor-green hover:bg-emerald-700 text-white py-3 rounded-lg font-bold text-sm transition-colors">
                {role === 'student' ? 'Build My Profile' : role === 'tutor' ? 'Complete Tutor Profile' : 'Go to Dashboard'}
              </button>
            </div>
          )}

          {/* ===== STEP 5: STUDENT PROFILE ===== */}
          {step === 5 && (
            <>
              <div className="text-center mb-3">
                <div className="mx-auto w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center mb-2">
                  <svg className="w-5 h-5 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h2 className="text-base font-bold text-gray-900 mb-0.5">Complete your profile</h2>
                <p className="text-[11px] text-gray-500">Tell us about your form level and subjects</p>
              </div>

              <form onSubmit={handleProfileSubmit} className="space-y-3">
                <fieldset>
                  <legend className="block text-xs font-semibold text-gray-800 mb-1.5">Are you affiliated with a school?</legend>
                  <div className="space-y-1">
                    {([
                      { value: 'attend' as const, label: 'Yes, I attend a school' },
                      { value: 'teach' as const, label: 'Yes, I teach at a school' },
                      { value: 'none' as const, label: 'No, not affiliated' },
                    ]).map(({ value, label }) => (
                      <label key={value} className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg border border-gray-200 bg-white hover:border-itutor-green cursor-pointer transition">
                        <input type="radio" name="affiliation" value={value} checked={affiliation === value}
                          onChange={() => setAffiliation(value)} disabled={loading}
                          className="h-3.5 w-3.5 text-itutor-green border-gray-300 focus:ring-itutor-green" />
                        <span className="text-gray-800 text-[11px]">{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {(affiliation === 'attend' || affiliation === 'teach') && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-800 mb-1">School (optional)</label>
                    <InstitutionAutocomplete
                      selectedInstitution={studentInstitution}
                      onChange={setStudentInstitution}
                      filters={{ institution_level: 'secondary', country_code: 'TT' }}
                      disabled={loading}
                      placeholder="Type to search (e.g. Presentation, QRC)..."
                      required={false}
                      hideDefaultHint
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="formLevel" className="block text-xs font-semibold text-gray-800 mb-1">
                    Form Level <span className="text-red-500">*</span>
                  </label>
                  <select id="formLevel" value={formLevel} onChange={(e) => setFormLevel(e.target.value)} disabled={loading}
                    className={`${inputBase} ${!formLevel ? 'text-gray-400' : ''}`}>
                    <option value="">Select your form level</option>
                    {FORM_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-800 mb-0.5">
                    Subjects of Study <span className="text-red-500">*</span>
                  </label>
                  <p className="text-[10px] text-gray-500 mb-1">Search and select the subjects you&apos;re studying.</p>
                  <SubjectMultiSelect
                    selectedSubjects={studentSubjects}
                    onChange={setStudentSubjects}
                    disabled={loading}
                    placeholder="Type subject name (e.g. Mathematics, Physics)..."
                  />
                </div>

                <button type="submit" disabled={loading}
                  className="w-full bg-itutor-green hover:bg-emerald-700 text-white py-2.5 rounded-lg font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                      Saving...
                    </span>
                  ) : 'Complete Profile'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
