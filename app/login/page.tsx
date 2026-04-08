'use client';

import { FormEvent, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, setRememberMePreference, createSupabaseClient } from '@/lib/supabase/client';
import SocialLoginButton from '@/components/SocialLoginButton';
import {
  getAdminHomePath,
  isEmailManagementOnlyAdmin,
} from '@/lib/auth/adminAccess';

// Helper function to detect network errors
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return true;
  }
  if (error instanceof Error && (
    error.message.includes('network') ||
    error.message.includes('Network') ||
    error.message.includes('fetch')
  )) {
    return true;
  }
  return !navigator.onLine;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showEmailSent, setShowEmailSent] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  const [resendError, setResendError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Check for email sent parameter, confirmation, and error messages
  useEffect(() => {
    const emailSent = searchParams.get('emailSent');
    const confirmed = searchParams.get('confirmed');
    const userEmail = searchParams.get('email');
    const errorParam = searchParams.get('error');
    const messageParam = searchParams.get('message');
    const reasonParam = searchParams.get('reason');

    // Handle email confirmation success
    if (confirmed === 'true') {
      setEmailConfirmed(true);
      if (userEmail) {
        setEmail(userEmail);
      }
      // Don't show the emailSent banner if email is already confirmed
      setShowEmailSent(false);
      return;
    }

    // Email exists (redirected from signup)
    if (reasonParam === 'email_in_use') {
      if (userEmail) setEmail(userEmail);
      setShowEmailSent(false);
      setError('This email is already in use. Please sign in instead.');
    }

    // Handle email sent (awaiting confirmation)
    if (emailSent === 'true' && userEmail) {
      setShowEmailSent(true);
      setResendEmail(userEmail);
      setEmail(userEmail);
      // Start 60-second cooldown
      setResendCooldown(60);
    }

    // Handle callback errors
    if (errorParam) {
      let errorMessage = '';
      switch (errorParam) {
        case 'oauth_failed':
          errorMessage = messageParam ? decodeURIComponent(messageParam) : 'Authentication failed. Please try again.';
          break;
        case 'no_session':
          errorMessage = 'Unable to establish session. Please log in manually below.';
          break;
        case 'invalid_callback':
        case 'missing_code':
          errorMessage = 'Invalid authentication link. Please try logging in.';
          break;
        case 'profile_fetch_failed':
          errorMessage = 'Unable to load your profile. Please contact support if this persists.';
          break;
        case 'profile_creation_failed':
          errorMessage = 'Unable to create your profile. Please try again.';
          break;
        default:
          errorMessage = 'An error occurred. Please try logging in.';
      }
      setError(errorMessage);
    }
  }, [searchParams]);

  // Countdown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResendEmail = async () => {
    if (resendCooldown > 0) return;

    setResendLoading(true);
    setResendError('');
    setResendSuccess('');

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: resendEmail,
      });

      if (error) {
        setResendError(error.message);
      } else {
        setResendSuccess('Verification email sent! Please check your inbox.');
        setResendCooldown(60); // Reset cooldown
      }
    } catch (err) {
      setResendError('Failed to resend email. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Store the "Keep me signed in" preference FIRST
      setRememberMePreference(rememberMe);

      // Now create client with the correct storage based on preference
      const supabaseClient = createSupabaseClient(rememberMe);

      const { data: authData, error: signInError } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // Check if error is due to unverified email
        if (signInError.message.includes('Email not confirmed') ||
            signInError.message.includes('not confirmed') ||
            signInError.message.includes('verify your email')) {
          // Redirect to code verification page with email
          router.push(`/verify-code?email=${encodeURIComponent(email)}`);
          return;
        }
        // Show user-friendly error message
        if (signInError.message.includes('Invalid login credentials') ||
            signInError.message.includes('Invalid') ||
            signInError.message.includes('credentials')) {
          setError('Incorrect email or password');
        } else {
          setError(signInError.message);
        }
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Unable to log in. Please try again.');
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();

      let profileData = profile;

      if (profileError || !profileData) {
        await fetch('/api/profile/ensure', { method: 'POST' }).catch(() => {});
        const { data: ensuredProfile, error: ensuredError } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (ensuredError || !ensuredProfile) {
          setError('Unable to fetch user profile.');
          setLoading(false);
          return;
        }

        profileData = ensuredProfile;
      }

      if (!profileData.role) {
        router.push('/signup/complete-role');
        return;
      }

      // Check for redirect parameter
      const redirectUrl = searchParams.get('redirect');

      if (isEmailManagementOnlyAdmin(profileData.email)) {
        router.push('/admin/emails');
        return;
      }

      // If there's a redirect URL, go there instead of dashboard
      if (redirectUrl) {
        router.push(decodeURIComponent(redirectUrl));
        return;
      }

      // Check if user is an admin first
      if (profileData.role === 'admin') {
        router.push(getAdminHomePath(profileData.email));
        return;
      }

      // Check if user is a reviewer
      if (profileData.is_reviewer) {
        router.push('/reviewer/dashboard');
        return;
      }

      switch (profileData.role) {
        case 'student':
          // If this is a child account created by a parent, skip profile check
          if (profileData.billing_mode === 'parent_required') {
            router.push('/student/dashboard');
            break;
          }

          // For regular students, check if profile is complete
          const hasBasicInfo = Boolean(profileData.form_level);

          // Check for subjects in user_subjects table
          const { data: userSubjects } = await supabaseClient
            .from('user_subjects')
            .select('subject_id')
            .eq('user_id', authData.user.id)
            .limit(1);

          const hasSubjects =
            (profileData.subjects_of_study && profileData.subjects_of_study.length > 0) ||
            (userSubjects && userSubjects.length > 0);

          const isStudentProfileComplete = hasBasicInfo && hasSubjects;

          if (isStudentProfileComplete) {
            router.push('/student/dashboard');
          } else {
            router.push('/onboarding/student');
          }
          break;
        case 'parent':
          router.push('/parent/dashboard');
          break;
        case 'tutor':
          router.push('/tutor/dashboard');
          break;
        default:
          setError('Invalid user role.');
          setLoading(false);
      }
    } catch (err) {
      if (isNetworkError(err)) {
        setError('Connect to the Internet');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ background: 'radial-gradient(ellipse 70% 60% at 15% 20%, rgba(34,197,94,0.22) 0%, transparent 65%), radial-gradient(ellipse 55% 50% at 85% 80%, rgba(34,197,94,0.14) 0%, transparent 65%), linear-gradient(160deg, #07180b 0%, #0e2a14 50%, #081510 100%)' }}
    >
      {/* Dot grid overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, rgba(34,197,94,0.07) 1px, transparent 1px)', backgroundSize: '34px 34px' }} />

      {/* LEFT PANEL */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-14 relative overflow-hidden">
        {/* Decorative rings */}
        <div className="absolute w-[540px] h-[540px] -top-40 -left-40 rounded-full border border-itutor-green/10 pointer-events-none" />
        <div className="absolute w-[340px] h-[340px] -bottom-28 -right-12 rounded-full border border-itutor-green/[0.07] pointer-events-none" />

        {/* Brand */}
        <div className="relative z-10">
          <img src="/assets/logo/itutor-logo-dark.png" alt="iTutor" className="h-8 w-auto" />
        </div>

        {/* Hero */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-itutor-green/10 border border-itutor-green/25 rounded-full px-4 py-1.5 mb-5">
            <span className="w-2 h-2 rounded-full bg-itutor-green animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-itutor-green">Caribbean&apos;s #1 Tutoring Platform</span>
          </div>
          <h1 className="text-[2.6rem] font-extrabold text-white leading-[1.08] tracking-tight mb-4">
            Find your <span className="text-itutor-green">perfect tutor,</span><br />ace every subject.
          </h1>
          <p className="text-white/50 text-[15px] leading-relaxed max-w-[340px]">
            Get matched with top-rated verified iTutors. CSEC, CAPE &amp; beyond — all in one platform.
          </p>
        </div>

        {/* Feature cards */}
        <div className="relative z-10 flex flex-col gap-3">
          {[
            { icon: 'person', color: 'from-itutor-green to-emerald-600', title: '1-on-1 Live Sessions', sub: 'Real-time tutoring, any time you need' },
            { icon: 'chart', color: 'from-teal-400 to-teal-600', title: 'Track Your Progress', sub: 'Visual dashboards & session history' },
            { icon: 'calendar', color: 'from-blue-400 to-blue-600', title: 'Flexible Scheduling', sub: 'Book sessions around your timetable' },
          ].map((feat, i) => (
            <div key={i} className="flex items-center gap-4 bg-white/[0.05] border border-white/[0.1] backdrop-blur-sm rounded-2xl px-5 py-4 w-fit min-w-[280px]" style={{ marginLeft: i === 1 ? '20px' : i === 2 ? '8px' : '0' }}>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${feat.color} flex items-center justify-center flex-shrink-0`}>
                {feat.icon === 'person' && <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>}
                {feat.icon === 'chart' && <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
                {feat.icon === 'calendar' && <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white">{feat.title}</p>
                <p className="text-[11px] text-white/40">{feat.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Stats strip */}
        <div className="relative z-10 flex gap-8">
          {[
            { val: '2,300+', lbl: 'Expert Tutors' },
            { val: '80+', lbl: 'Subjects' },
            { val: '4.9★', lbl: 'Avg. Rating' },
            { val: '50K+', lbl: 'Students' },
          ].map((s) => (
            <div key={s.lbl}>
              <p className="text-2xl font-extrabold text-itutor-green tracking-tight">{s.val}</p>
              <p className="text-[11px] text-white/40 mt-0.5">{s.lbl}</p>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL — floating card */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative z-10 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md px-8 py-10">
        <div className="w-full">
          {/* Logo at top of card */}
          <div className="flex justify-center mb-6">
            <img src="/assets/logo/itutor-logo-dark.png.png" alt="iTutor" className="h-8 w-auto" onError={(e) => { (e.target as HTMLImageElement).src = '/assets/logo/itutor-logo-dark.png'; }} />
          </div>

          {/* Heading */}
          <div className="mb-7 text-center">
            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight mb-1">Welcome back</h2>
            <p className="text-sm text-gray-500">Sign in to your iTutor account</p>
          </div>

          {/* Google button + divider */}
          <div className="mb-5 space-y-3">
            <SocialLoginButton provider="google" mode="login" />
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wide">
                <span className="bg-white px-2 text-gray-400">or continue with email</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email Confirmed Success Banner */}
            {emailConfirmed && (
              <div className="bg-green-900/20 border-2 border-green-500/50 text-green-200 px-4 py-4 rounded-lg backdrop-blur-sm relative">
                <button
                  onClick={() => setEmailConfirmed(false)}
                  className="absolute top-2 right-2 text-green-400 hover:text-green-300 transition-colors"
                  type="button"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 pr-4">
                    <p className="font-bold text-green-100 mb-2 text-lg">✅ Email Confirmed!</p>
                    <p className="text-sm text-green-200 mb-2">
                      Your email has been successfully verified. You can now log in to your iTutor account.
                    </p>
                    <p className="text-xs text-green-300">
                      Enter your email and password below to continue.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Email Sent (Awaiting Confirmation) Banner */}
            {showEmailSent && (
              <div className="bg-green-900/20 border-2 border-green-500/50 text-green-200 px-4 py-4 rounded-lg backdrop-blur-sm space-y-3 relative">
                <button
                  onClick={() => setShowEmailSent(false)}
                  className="absolute top-2 right-2 text-green-400 hover:text-green-300 transition-colors"
                  type="button"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 pr-4">
                    <p className="font-semibold text-green-100 mb-1">Account Created!</p>
                    <p className="text-sm text-green-200 mb-3">
                      Please check your email to verify your account. After verification, you can log in below.
                    </p>

                    <div className="bg-green-950/30 border border-green-600/30 rounded-md p-3 mb-3">
                      <p className="text-xs text-green-300 font-medium mb-1">Didn't receive the email?</p>
                      <ul className="text-xs text-green-300/90 space-y-0.5 list-disc list-inside">
                        <li>Check your spam or junk folder</li>
                        <li>Make sure you entered the correct email</li>
                        <li>Wait a few minutes for delivery</li>
                      </ul>
                    </div>

                    {resendSuccess && (
                      <div className="bg-green-800/30 border border-green-400/30 text-green-100 px-3 py-2 rounded-md text-sm mb-2">
                        {resendSuccess}
                      </div>
                    )}

                    {resendError && (
                      <div className="bg-red-900/30 border border-red-400/30 text-red-200 px-3 py-2 rounded-md text-sm mb-2">
                        {resendError}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleResendEmail}
                      disabled={resendCooldown > 0 || resendLoading}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resendLoading ? (
                        'Sending...'
                      ) : resendCooldown > 0 ? (
                        `Resend email (${resendCooldown}s)`
                      ) : (
                        'Resend verification email'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-900/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg backdrop-blur-sm">
                <p className="text-sm">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-800 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none focus:bg-white transition placeholder-gray-400 text-sm"
                placeholder="you@example.com"
                required
                disabled={loading}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-semibold text-gray-800">
                  Password
                </label>
                <a
                  href="/forgot-password"
                  className="text-sm text-itutor-green hover:text-emerald-400 font-medium transition-colors"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-10 bg-gray-50 border-2 border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none focus:bg-white transition placeholder-gray-400 text-sm"
                  placeholder="Enter your password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-itutor-green focus:ring-2 focus:ring-itutor-green focus:ring-offset-0 cursor-pointer"
                disabled={loading}
              />
              <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-600 cursor-pointer select-none">
                Keep me signed in
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-3 px-4 rounded-lg focus:ring-4 focus:ring-itutor-green/30 focus:outline-none transition-all font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-itutor-green/20 transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="mt-6 space-y-3">
            <p className="text-sm text-gray-500 text-center">
              Don&apos;t have an account?{' '}
              <a href="/signup" className="text-itutor-green hover:text-emerald-500 font-semibold transition-colors">
                Sign up
              </a>
            </p>

            {/* Only show verification link if user just signed up or has unverified email */}
            {showEmailSent && (
              <p className="text-sm text-gray-500 text-center">
                Haven&apos;t verified your email?{' '}
                <a href={`/verify-code${resendEmail ? `?email=${encodeURIComponent(resendEmail)}` : ''}`} className="text-itutor-green hover:text-emerald-500 font-semibold transition-colors">
                  Enter verification code
                </a>
              </p>
            )}

            <a href="/" className="flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 pt-4 border-t border-gray-100 mt-4 transition">
              ← Back to home
            </a>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
