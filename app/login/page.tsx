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
    <div className="min-h-screen flex" style={{ backgroundColor: '#e8f5ee' }}>
      {/* Floating decorative circles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-32 h-32 rounded-full bg-itutor-green/20 -top-8 left-12" />
        <div className="absolute w-20 h-20 rounded-full bg-itutor-green/15 top-1/3 left-4" />
        <div className="absolute w-48 h-48 rounded-full bg-itutor-green/10 bottom-0 left-1/4" />
        <div className="absolute w-16 h-16 rounded-full bg-itutor-green/20 top-16 left-1/3" />
        <div className="absolute w-10 h-10 rounded-full bg-itutor-green/25 bottom-32 left-8" />
      </div>

      {/* LEFT PANEL */}
      <div className="hidden lg:flex flex-1 flex-col justify-center px-14 py-16 relative overflow-hidden">
        {/* Headline */}
        <div className="mb-10">
          <h1 className="text-4xl font-extrabold text-gray-900 leading-tight mb-8">
            #1 Tutoring platform<br />in the Caribbean!
          </h1>
          <ul className="space-y-4">
            {['Verified iTutors', 'Caribbean Curriculum', 'Exam-focused help'].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-itutor-green flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span className="text-lg font-semibold text-gray-800">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Illustration */}
        <div className="relative w-full max-w-sm">
          <svg viewBox="0 0 420 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <rect x="40" y="200" width="340" height="14" rx="7" fill="#a7d7b8"/>
            <rect x="100" y="160" width="200" height="12" rx="6" fill="#4ade80"/>
            <rect x="110" y="80" width="180" height="85" rx="10" fill="#1a2e1f"/>
            <rect x="118" y="88" width="164" height="69" rx="6" fill="#22c55e" opacity="0.15"/>
            <rect x="128" y="98" width="80" height="8" rx="4" fill="#4ade80" opacity="0.7"/>
            <rect x="128" y="112" width="60" height="6" rx="3" fill="#4ade80" opacity="0.4"/>
            <rect x="128" y="124" width="70" height="6" rx="3" fill="#4ade80" opacity="0.4"/>
            <rect x="215" y="93" width="52" height="36" rx="8" fill="white" opacity="0.9"/>
            <path d="M221 129 l6 8 l4-8" fill="white" opacity="0.9"/>
            <circle cx="225" cy="104" r="6" fill="#4ade80"/>
            <rect x="236" y="100" width="25" height="4" rx="2" fill="#d1fae5"/>
            <rect x="236" y="108" width="18" height="3" rx="1.5" fill="#d1fae5"/>
            <circle cx="155" cy="145" r="20" fill="#fbbf24"/>
            <rect x="135" y="165" width="40" height="40" rx="8" fill="#22c55e"/>
            <circle cx="215" cy="148" r="18" fill="#f9a8d4"/>
            <rect x="197" y="166" width="36" height="38" rx="8" fill="#fbbf24"/>
            <path d="M135 140 q20-30 40 0" fill="#92400e"/>
            <path d="M197 140 q18-25 36 0" fill="#7c3aed" opacity="0.6"/>
            <rect x="230" y="185" width="60" height="18" rx="4" fill="white" opacity="0.8"/>
            <line x1="240" y1="191" x2="282" y2="191" stroke="#4ade80" strokeWidth="1.5"/>
            <line x1="240" y1="197" x2="270" y2="197" stroke="#4ade80" strokeWidth="1.5"/>
            <rect x="80" y="175" width="6" height="28" rx="3" fill="#fbbf24" transform="rotate(-15 83 189)"/>
            <rect x="70" y="178" width="6" height="28" rx="3" fill="#f87171" transform="rotate(-8 73 192)"/>
            <rect x="330" y="130" width="6" height="72" rx="3" fill="#6b7280"/>
            <ellipse cx="333" cy="128" rx="22" ry="12" fill="#4ade80" opacity="0.8"/>
            <ellipse cx="333" cy="128" rx="14" ry="7" fill="#a7f3d0"/>
          </svg>
        </div>
      </div>

      {/* RIGHT PANEL — floating card */}
      <div className="w-full lg:w-[480px] flex items-center justify-center p-6 lg:p-10 relative z-10 overflow-y-auto">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm px-8 py-9">
        <div className="w-full">
          {/* Logo at top of card */}
          <div className="flex justify-center mb-4">
            <img src="/assets/logo/itutor-logo-dark.png" alt="iTutor" className="h-7 w-auto" />
          </div>

          {/* Heading */}
          <div className="mb-7 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome</h2>
            <p className="text-sm text-gray-500">Sign in to your iTutor account</p>
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
              className="w-full bg-itutor-green hover:bg-emerald-600 text-white py-3 px-4 rounded-xl focus:ring-4 focus:ring-itutor-green/30 focus:outline-none transition-all font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-itutor-green/20"
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

          <div className="mt-5 space-y-3 text-center">
            <p className="text-sm text-gray-500">
              Don&apos;t have an account?{' '}
              <a href="/signup" className="text-itutor-green font-bold hover:underline">Sign up</a>
            </p>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
              <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">or</span></div>
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
    </div>
  );
}
