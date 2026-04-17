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

  const inputBase = "w-full bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400 text-sm py-3 px-4";
  const inputWithIcon = "w-full bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400 text-sm py-3 pl-10 pr-4";

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #071a0e 0%, #0d2318 50%, #0a1e14 100%)' }}>

      {/* LEFT PANEL */}
      <div className="relative hidden flex-col justify-between overflow-hidden px-16 py-14 lg:flex lg:w-[52%] lg:items-start">
        <div className="absolute top-[-80px] right-[-80px] w-[500px] h-[500px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(25,147,86,0.13) 0%, transparent 65%)' }} />
        <div className="absolute bottom-[-60px] left-[-60px] w-80 h-80 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(25,147,86,0.09) 0%, transparent 70%)' }} />

        {/* Logo: green mark + white wordmark (same as signup hero) */}
        <div className="flex items-center gap-3 -ml-4 sm:-ml-6">
          <img
            src="/assets/logo/itutor-mark.png"
            alt=""
            className="h-28 w-auto shrink-0 object-contain object-left mix-blend-screen sm:h-[9rem]"
            aria-hidden
          />
          <span className="text-7xl font-bold lowercase tracking-tight text-white sm:text-8xl">itutor</span>
          <span className="sr-only">iTutor</span>
        </div>

        {/* Main copy */}
        <div className="flex flex-col">
          <h1 className="font-extrabold text-white leading-[1.05] mb-5" style={{ fontSize: 'clamp(3rem, 5.5vw, 4.5rem)' }}>
            Good to<br />see<br />
            <span style={{ color: '#2ecc7a' }}>you again.</span>
          </h1>

          <p className="text-base mb-8 max-w-xs leading-relaxed" style={{ color: 'rgba(180,230,200,0.65)' }}>
            Your tutors are ready. Pick up right<br />where you left off.
          </p>

          {/* Pill tags */}
          <div className="flex flex-wrap gap-2">
            {['📚 Study', '✏️ Practice', '⭐ Achieve', '🔬 Explore', '🚀 Grow'].map((tag) => (
              <span
                key={tag}
                className="px-4 py-1.5 rounded-full text-sm font-medium"
                style={{
                  background: 'rgba(25,147,86,0.15)',
                  border: '1px solid rgba(46,204,122,0.25)',
                  color: 'rgba(180,230,200,0.80)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <p className="text-xs tracking-widest font-semibold uppercase" style={{ color: 'rgba(46,204,122,0.45)' }}>
          Caribbean&apos;s #1 Tutoring Platform
        </p>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full lg:w-[48%] flex items-center justify-center px-8 py-10 relative z-10">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[400px] px-8 py-8">

          {/* Heading */}
          <div className="text-center mb-5">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome</h2>
            <p className="text-sm text-gray-500">Sign in to your iTutor account</p>
          </div>

          {/* Status banners */}
          {emailConfirmed && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 relative">
              <button onClick={() => setEmailConfirmed(false)} type="button" className="absolute top-2 right-2 text-green-500 hover:text-green-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
              <p className="text-sm font-semibold">Email confirmed! You can now sign in.</p>
            </div>
          )}

          {showEmailSent && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 relative">
              <button onClick={() => setShowEmailSent(false)} type="button" className="absolute top-2 right-2 text-green-500 hover:text-green-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
              <p className="text-sm font-semibold mb-1">Account created! Check your email to verify.</p>
              {resendSuccess && <p className="text-xs text-green-600 mt-1">{resendSuccess}</p>}
              {resendError && <p className="text-xs text-red-500 mt-1">{resendError}</p>}
              <button type="button" onClick={handleResendEmail} disabled={resendCooldown > 0 || resendLoading}
                className="mt-2 text-xs font-medium text-itutor-green hover:underline disabled:opacity-50">
                {resendLoading ? 'Sending...' : resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend verification email'}
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-lg mb-4">
              <p className="text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3.5">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className={inputWithIcon} placeholder="you@example.com" required disabled={loading} />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-700">Password</label>
                <a href="/forgot-password" className="text-sm text-itutor-green font-medium hover:underline">Forgot password?</a>
              </div>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  className={`${inputBase} pr-14`} placeholder="Enter your password" required disabled={loading} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 hover:text-gray-700 font-medium" tabIndex={-1}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="rememberMe" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-itutor-green focus:ring-itutor-green cursor-pointer" disabled={loading} />
                <label htmlFor="rememberMe" className="text-sm text-gray-600 cursor-pointer">Keep me signed in</label>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-itutor-green hover:bg-emerald-700 text-white py-3 rounded-lg font-bold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          <div className="mt-4 text-center space-y-3">
            <p className="text-sm text-gray-600">
              Don&apos;t have an account?{' '}
              <a href="/signup" className="font-bold text-gray-900 hover:text-itutor-green transition-colors">Sign up</a>
            </p>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <SocialLoginButton provider="google" mode="login" />

            {showEmailSent && (
              <p className="text-xs text-gray-400">
                Haven&apos;t verified?{' '}
                <a href={`/verify-code${resendEmail ? `?email=${encodeURIComponent(resendEmail)}` : ''}`} className="text-itutor-green font-medium hover:underline">Enter code</a>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
