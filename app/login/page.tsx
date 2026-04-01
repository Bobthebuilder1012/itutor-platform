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
    <div className="min-h-screen flex" style={{ backgroundColor: '#dff0e8' }}>
      {/* Decorative circles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-40 h-40 rounded-full" style={{ background: 'rgba(74,222,128,0.25)', top: '-30px', left: '60px' }} />
        <div className="absolute w-24 h-24 rounded-full" style={{ background: 'rgba(74,222,128,0.18)', top: '38%', left: '-20px' }} />
        <div className="absolute w-56 h-56 rounded-full" style={{ background: 'rgba(74,222,128,0.12)', bottom: '-40px', left: '18%' }} />
        <div className="absolute w-20 h-20 rounded-full" style={{ background: 'rgba(74,222,128,0.22)', top: '10%', left: '32%' }} />
        <div className="absolute w-12 h-12 rounded-full" style={{ background: 'rgba(74,222,128,0.28)', bottom: '20%', left: '6%' }} />
        <div className="absolute w-8 h-8 rounded-full" style={{ background: 'rgba(74,222,128,0.20)', top: '55%', left: '42%' }} />
      </div>

      {/* LEFT PANEL */}
      <div className="hidden lg:flex flex-1 flex-col justify-center px-16 py-12 relative">
        <h1 className="text-[2.6rem] font-extrabold text-gray-900 leading-[1.15] mb-8">
          #1 Tutoring platform<br />in the Caribbean!
        </h1>

        <ul className="space-y-5 mb-12">
          {['Verified iTutors', 'Caribbean Curriculum', 'Exam-focused help'].map((item) => (
            <li key={item} className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-itutor-green flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="text-[1.05rem] font-semibold text-gray-800">{item}</span>
            </li>
          ))}
        </ul>

        {/* Illustration */}
        <div className="w-full max-w-[420px]">
          <svg viewBox="0 0 480 320" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full drop-shadow-sm">
            <rect x="20" y="232" width="440" height="16" rx="8" fill="#86c9a0" opacity="0.6"/>
            <rect x="60" y="220" width="360" height="14" rx="7" fill="#a7d9bc"/>
            <rect x="390" y="148" width="7" height="74" rx="3.5" fill="#9ca3af"/>
            <rect x="370" y="144" width="28" height="7" rx="3.5" fill="#9ca3af" transform="rotate(-20 384 147)"/>
            <ellipse cx="375" cy="130" rx="26" ry="13" fill="#4ade80" opacity="0.85"/>
            <ellipse cx="375" cy="130" rx="16" ry="8" fill="#bbf7d0"/>
            <ellipse cx="375" cy="158" rx="30" ry="10" fill="#4ade80" opacity="0.08"/>
            <rect x="72" y="196" width="26" height="28" rx="4" fill="#34d399" opacity="0.5"/>
            <rect x="77" y="178" width="5" height="22" rx="2.5" fill="#fbbf24" transform="rotate(-12 79 189)"/>
            <rect x="85" y="176" width="5" height="22" rx="2.5" fill="#f87171" transform="rotate(6 87 187)"/>
            <rect x="80" y="174" width="5" height="22" rx="2.5" fill="#60a5fa" transform="rotate(-3 82 185)"/>
            <rect x="108" y="208" width="44" height="12" rx="3" fill="#6ee7b7"/>
            <rect x="111" y="198" width="38" height="12" rx="3" fill="#34d399"/>
            <rect x="114" y="188" width="32" height="12" rx="3" fill="#059669"/>
            <rect x="158" y="192" width="220" height="30" rx="8" fill="#4ade80" opacity="0.9"/>
            <rect x="168" y="196" width="200" height="22" rx="5" fill="#86efac" opacity="0.5"/>
            <rect x="155" y="85" width="226" height="114" rx="12" fill="#1a2e1f"/>
            <rect x="163" y="93" width="210" height="98" rx="7" fill="#0f2218"/>
            <rect x="163" y="93" width="210" height="98" rx="7" fill="#22c55e" opacity="0.08"/>
            <rect x="175" y="108" width="90" height="9" rx="4.5" fill="#4ade80" opacity="0.75"/>
            <rect x="175" y="124" width="70" height="7" rx="3.5" fill="#4ade80" opacity="0.4"/>
            <rect x="175" y="137" width="80" height="7" rx="3.5" fill="#4ade80" opacity="0.35"/>
            <rect x="175" y="150" width="55" height="7" rx="3.5" fill="#4ade80" opacity="0.3"/>
            <rect x="267" y="98" width="90" height="56" rx="10" fill="white" opacity="0.92"/>
            <path d="M273 154 l8 12 l6-12" fill="white" opacity="0.92"/>
            <circle cx="283" cy="116" r="9" fill="#4ade80"/>
            <circle cx="283" cy="113" r="3.5" fill="white" opacity="0.9"/>
            <path d="M277 122 q6-4 12 0" stroke="white" strokeWidth="1.2" fill="none" opacity="0.8"/>
            <rect x="297" y="110" width="52" height="5" rx="2.5" fill="#d1fae5"/>
            <rect x="297" y="120" width="40" height="4" rx="2" fill="#d1fae5" opacity="0.7"/>
            <rect x="272" y="133" width="78" height="4" rx="2" fill="#d1fae5" opacity="0.5"/>
            <rect x="272" y="141" width="60" height="4" rx="2" fill="#d1fae5" opacity="0.4"/>
            <rect x="245" y="195" width="50" height="6" rx="3" fill="#16a34a" opacity="0.6"/>
            <rect x="162" y="180" width="58" height="46" rx="10" fill="#16a34a"/>
            <circle cx="191" cy="158" r="25" fill="#fde68a"/>
            <path d="M166 152 q25-38 50 0" fill="#92400e"/>
            <circle cx="183" cy="156" r="2.5" fill="#1f2937"/>
            <circle cx="199" cy="156" r="2.5" fill="#1f2937"/>
            <path d="M184 165 q7 6 14 0" stroke="#d97706" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
            <rect x="216" y="186" width="40" height="14" rx="7" fill="#fde68a" transform="rotate(-10 236 193)"/>
            <rect x="268" y="180" width="56" height="46" rx="10" fill="#fbbf24"/>
            <circle cx="296" cy="160" r="23" fill="#fecdd3"/>
            <path d="M273 156 q23-34 46 0" fill="#7c3aed" opacity="0.55"/>
            <path d="M319 158 q12-6 10 10" stroke="#7c3aed" strokeWidth="7" strokeLinecap="round" fill="none" opacity="0.5"/>
            <circle cx="288" cy="158" r="2.3" fill="#1f2937"/>
            <circle cx="304" cy="158" r="2.3" fill="#1f2937"/>
            <path d="M289 167 q7 5 14 0" stroke="#be185d" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
            <rect x="232" y="185" width="38" height="13" rx="6.5" fill="#fecdd3" transform="rotate(8 251 191)"/>
            <rect x="262" y="194" width="4" height="18" rx="2" fill="#fbbf24" transform="rotate(15 264 203)"/>
            <rect x="295" y="200" width="80" height="22" rx="5" fill="white" opacity="0.9"/>
            <line x1="308" y1="208" x2="366" y2="208" stroke="#4ade80" strokeWidth="1.5"/>
            <line x1="308" y1="215" x2="352" y2="215" stroke="#4ade80" strokeWidth="1.5"/>
          </svg>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full lg:w-auto lg:min-w-[460px] flex items-center justify-center px-6 py-10 relative z-10">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[400px] px-8 py-8">

          {/* Logo */}
          <div className="flex justify-center mb-3">
            <img src="/assets/logo/itutor-logo-dark.png" alt="iTutor" className="h-8 w-auto" />
          </div>

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
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className={inputWithIcon} placeholder="you@example.com" required disabled={loading} />
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
            <div className="flex items-center gap-2">
              <input type="checkbox" id="rememberMe" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-itutor-green focus:ring-itutor-green cursor-pointer" disabled={loading} />
              <label htmlFor="rememberMe" className="text-sm text-gray-600 cursor-pointer">Keep me signed in</label>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-itutor-green hover:bg-emerald-700 text-white py-3 rounded-lg font-bold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1">
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
