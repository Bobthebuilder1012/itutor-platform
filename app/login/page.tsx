'use client';

import { FormEvent, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

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

  // Check for email sent parameter, confirmation, and error messages
  useEffect(() => {
    const emailSent = searchParams.get('emailSent');
    const confirmed = searchParams.get('confirmed');
    const userEmail = searchParams.get('email');
    const errorParam = searchParams.get('error');
    const messageParam = searchParams.get('message');
    
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
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
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

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, school, form_level, subjects_of_study, billing_mode, is_reviewer')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        setError('Unable to fetch user profile.');
        setLoading(false);
        return;
      }

      // If profile exists but has no role, redirect to signup to complete registration
      if (!profile.role) {
        setError('Your account setup is incomplete. Please complete your registration.');
        await supabase.auth.signOut();
        setTimeout(() => {
          router.push('/signup');
        }, 2000);
        return;
      }

      // Check for redirect parameter
      const redirectUrl = searchParams.get('redirect');
      
      // If there's a redirect URL, go there instead of dashboard
      if (redirectUrl) {
        router.push(decodeURIComponent(redirectUrl));
        return;
      }

      // Check if user is an admin first
      if (profile.role === 'admin') {
        router.push('/admin/dashboard');
        return;
      }

      // Check if user is a reviewer
      if (profile.is_reviewer) {
        router.push('/reviewer/dashboard');
        return;
      }

      switch (profile.role) {
        case 'student':
          // If this is a child account created by a parent, skip profile check
          if (profile.billing_mode === 'parent_required') {
            router.push('/student/dashboard');
            break;
          }
          
          // For regular students, check if profile is complete
          const hasBasicInfo = profile.school && profile.form_level;
          
          // Check for subjects in user_subjects table
          const { data: userSubjects } = await supabase
            .from('user_subjects')
            .select('subject_id')
            .eq('user_id', authData.user.id)
            .limit(1);
          
          const hasSubjects = 
            (profile.subjects_of_study && profile.subjects_of_study.length > 0) ||
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
    <div className="min-h-screen flex items-center justify-center bg-white px-4 py-8">
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="mb-4 flex justify-center">
            <img 
              src="/assets/logo/itutor-logo-dark.png" 
              alt="iTutor Logo" 
              className="h-12 w-auto"
            />
          </div>
          <h1 className="text-4xl font-bold text-itutor-white mb-2 tracking-tight">Welcome back</h1>
          <p className="text-gray-400">Sign in to your iTutor account</p>
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
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 text-itutor-white rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-500"
              placeholder="you@example.com"
              required
              disabled={loading}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
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
                className="w-full px-4 py-3 pr-10 bg-gray-900 border border-gray-700 text-itutor-white rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-500"
                placeholder="Enter your password"
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
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

        <div className="mt-6 text-center space-y-3">
          <p className="text-sm text-gray-400">
            Don't have an account?{' '}
            <a href="/signup" className="text-itutor-green hover:text-emerald-400 font-semibold transition-colors">
              Sign up
            </a>
          </p>
          
          {/* Only show verification link if user just signed up or has unverified email */}
          {showEmailSent && (
            <p className="text-sm text-gray-400">
              Haven't verified your email?{' '}
              <a href={`/verify-code${resendEmail ? `?email=${encodeURIComponent(resendEmail)}` : ''}`} className="text-itutor-green hover:text-emerald-400 font-semibold transition-colors">
                Enter verification code
              </a>
            </p>
          )}
          
          <div className="pt-4 border-t border-gray-700">
            <a href="/" className="text-xs text-gray-500 hover:text-gray-400 transition-colors">
              ← Back to home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
