'use client';

import { FormEvent, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import CountrySelect from '@/components/CountrySelect';
import SocialLoginButton from '@/components/SocialLoginButton';

type UserRole = 'student' | 'parent' | 'tutor';

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

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const role: UserRole = 'student'; // Fixed role for student signup
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Debounced username check
  useEffect(() => {
    const checkUsername = async () => {
      const trimmedUsername = username.trim();

      // Reset states
      setUsernameError('');
      setUsernameAvailable(false);

      if (!trimmedUsername) {
        return;
      }

      // Validate format first
      if (trimmedUsername.length < 6) {
        setUsernameError('Username must be at least 6 characters');
        return;
      }

      if (trimmedUsername.length > 30) {
        setUsernameError('Username must be 30 characters or less');
        return;
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
        setUsernameError('Only letters, numbers, _ and - allowed');
        return;
      }

      // Check availability
      setUsernameChecking(true);

      try {
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', trimmedUsername)
          .single();

        if (existingUser) {
          setUsernameError('This username is already taken');
          setUsernameAvailable(false);
        } else {
          setUsernameAvailable(true);
        }
      } catch (err) {
        // No user found means username is available
        setUsernameAvailable(true);
      } finally {
        setUsernameChecking(false);
      }
    };

    const timer = setTimeout(checkUsername, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [username]);

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!countryCode) {
      setError('Please select your country.');
      return;
    }

    // Validate username
    if (usernameError || !usernameAvailable) {
      setError('Please choose a valid and available username.');
      return;
    }

    if (!termsAccepted) {
      setError('You must accept the Terms & Conditions to continue.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      // Validate password length
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        setLoading(false);
        return;
      }

      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            username: username.trim(),
            role: role,
            country: countryCode,
            terms_accepted: true,
          }
        }
      });

      if (signUpError) {
        // Provide more helpful error messages
        const normalizedMessage = signUpError.message.toLowerCase();
        const isEmailInUse =
          normalizedMessage.includes('already registered') ||
          normalizedMessage.includes('user already registered') ||
          normalizedMessage.includes('email already');
        if (isEmailInUse) {
          const redirectUrl = searchParams.get('redirect');
          const redirectParam = redirectUrl ? `&redirect=${encodeURIComponent(redirectUrl)}` : '';
          router.push(`/login?reason=email_in_use&email=${encodeURIComponent(email)}${redirectParam}`);
          setLoading(false);
          return;
        } else {
          setError(signUpError.message);
        }
        setLoading(false);
        return;
      }

      // If identities is empty, Supabase indicates the email already exists
      const identitiesCount = authData.user?.identities?.length ?? 0;
      if (identitiesCount === 0) {
        const redirectUrl = searchParams.get('redirect');
        const redirectParam = redirectUrl ? `&redirect=${encodeURIComponent(redirectUrl)}` : '';
        router.push(`/login?reason=email_in_use&email=${encodeURIComponent(email)}${redirectParam}`);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Unable to complete signup. Please try again.');
        setLoading(false);
        return;
      }

      const redirectUrl = searchParams.get('redirect');
      const redirectParam = redirectUrl ? `&redirect=${encodeURIComponent(redirectUrl)}` : '';

      // If email confirmation is required, redirect to code verification page
      if (!authData.session) {
        router.push(`/verify-code?email=${encodeURIComponent(email)}${redirectParam}`);
        return;
      }

      // Small delay to ensure auth session is established
      await new Promise(resolve => setTimeout(resolve, 500));

      // Create profile directly (trigger approach didn't work reliably)
      // First check if profile already exists (in case trigger did create it)
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (existingProfile) {
        // Profile exists, update it
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            role,
            username: username.trim(),
            full_name: fullName,
            country: countryCode,
            terms_accepted: true,
            terms_accepted_at: new Date().toISOString(),
          })
          .eq('id', authData.user.id);

        if (updateError) {
          if (updateError.code === '23505') {
            setError('This username is already taken. Please choose another.');
          } else {
            setError(`Error updating profile: ${updateError.message}`);
          }
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
      } else {
        // Profile doesn't exist, create it using service role bypass
        // Use upsert to handle race conditions
        const { error: insertError } = await supabase
          .from('profiles')
          .upsert({
            id: authData.user.id,
            email: authData.user.email,
            role,
            username: username.trim(),
            full_name: fullName,
            country: countryCode,
            terms_accepted: true,
            terms_accepted_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'id'
          });

        if (insertError) {
          if (insertError.code === '23505') {
            setError('This username is already taken. Please choose another.');
          } else {
            setError(`Error creating profile: ${insertError.message}`);
          }
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
      }

      // Send welcome email immediately and enqueue follow-up sequence
      try {
        const welcomeRes = await fetch('/api/send-welcome-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: authData.user.id })
        });
        if (!welcomeRes.ok) {
          const err = await welcomeRes.json().catch(() => ({}));
          console.warn('Welcome email request failed:', welcomeRes.status, err);
        }

        // Enqueue follow-up emails (starting at stage 1, day 1)
        const nextSendAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // +1 day
        const { error: queueError } = await supabase
          .from('onboarding_email_queue')
          .insert({
            user_id: authData.user.id,
            user_type: role,
            stage: 1,
            next_send_at: nextSendAt.toISOString(),
            last_sent_at: new Date().toISOString()
          });

        if (queueError) {
          console.error('Failed to enqueue onboarding email:', queueError);
        }
      } catch (queueErr) {
        console.error('Error with onboarding email:', queueErr);
      }

      // Email confirmed or confirmation not required - proceed to next step
      if (role === 'student') {
        // If there's a redirect URL, go there after successful signup
        if (redirectUrl) {
          router.push(decodeURIComponent(redirectUrl));
        } else {
          router.push('/onboarding/student');
        }
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

  const inputBase = "w-full bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400 text-sm py-2 px-4";
  const inputWithIcon = "w-full bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400 text-sm py-2 pl-10 pr-4";

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #071a0e 0%, #0d2318 50%, #0a1e14 100%)' }}>

      {/* LEFT PANEL */}
      <div className="hidden lg:flex lg:w-[58%] flex-col justify-center px-24 py-12 items-center relative overflow-hidden">
        {/* Background glows */}
        <div className="absolute top-[-60px] right-[-60px] w-80 h-80 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(25,147,86,0.18) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[40px] left-[-60px] w-64 h-64 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(25,147,86,0.10) 0%, transparent 70%)' }} />

        {/* Main content */}
        <div className="flex flex-col w-full max-w-lg">
          {/* Top logo */}
          <div className="mb-12">
            <img src="/assets/logo/itutor-logo-dark.png" alt="iTutor" className="h-24 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
          </div>

          {/* Badge */}
          <div className="inline-flex mb-6">
            <span className="px-4 py-1.5 rounded-full text-sm font-semibold tracking-wide" style={{ color: '#5dcea0', border: '1px solid rgba(25,147,86,0.45)', backgroundColor: 'rgba(25,147,86,0.15)' }}>
              ✦ CARIBBEAN&apos;S #1 TUTORING PLATFORM
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-[3.25rem] font-extrabold text-white leading-tight mb-6">
            Find your<br />
            <span style={{ color: '#2ecc7a' }} className="whitespace-nowrap">perfect tutor,</span><br />
            ace every subject.
          </h1>

          {/* Stats — liquid glass squares */}
          <div className="flex gap-3 mb-8">
            {[
              { value: '100+', label: 'Expert Tutors' },
              { value: '50+', label: 'Subjects' },
              { value: '4.9★', label: 'Avg. Rating' },
              { value: '200+', label: 'Students' },
            ].map(({ value, label }) => (
              <div
                key={label}
                className="flex flex-col items-center justify-center rounded-xl px-4 py-3 backdrop-blur-md"
                style={{
                  background: 'rgba(25,147,86,0.15)',
                  border: '1px solid rgba(46,204,122,0.30)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(25,147,86,0.12)',
                  minWidth: '78px',
                }}
              >
                <span className="text-xl font-extrabold leading-none" style={{ color: '#2ecc7a' }}>{value}</span>
                <span className="text-[10px] mt-1 text-center leading-tight" style={{ color: 'rgba(180,230,200,0.70)' }}>{label}</span>
              </div>
            ))}
          </div>

          <p className="text-base mb-8 leading-relaxed" style={{ color: 'rgba(180,230,200,0.70)' }}>
            Get matched with top-rated verified iTutors.<br />
            CSEC, CAPE &amp; beyond — all in one platform.
          </p>

          {/* Feature cards */}
          <div className="space-y-3">
            {[
              {
                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />,
                title: '1-on-1 Live Sessions',
                desc: 'Real-time tutoring, any time you need',
              },
              {
                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
                title: 'Track Your Progress',
                desc: 'Visual dashboards & session history',
              },
              {
                icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
                title: 'Flexible Scheduling',
                desc: 'Book sessions around your timetable',
              },
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
      <div className="w-full lg:w-[42%] flex items-center justify-center px-8 py-10 relative z-10">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[400px] px-8 py-6">

          {/* Heading */}
          <div className="text-center mb-2">
            <h2 className="text-base font-bold text-gray-900 mb-0.5">Create your account</h2>
            <p className="text-xs text-gray-500">Sign up for your iTutor account</p>
          </div>

          {/* Google button */}
          <div className="mb-2">
            <SocialLoginButton provider="google" mode="signup" redirectTo="/auth/callback?next=/signup/complete-role" />
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium tracking-wider">OR CONTINUE WITH EMAIL</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg mb-2">
              <p className="text-xs">{error}</p>
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-2">
            {/* Name */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                className={inputWithIcon} placeholder="Name" required disabled={loading} />
            </div>

            {/* Username */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
              </span>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                className={`${inputWithIcon} pr-10 ${usernameError ? 'border-red-400 focus:ring-red-400' : usernameAvailable && username ? 'border-itutor-green' : ''}`}
                placeholder="Username" required disabled={loading} minLength={6} maxLength={30} />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {usernameChecking ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-itutor-green" />
                ) : usernameError ? (
                  <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg>
                ) : usernameAvailable && username ? (
                  <svg className="w-4 h-4 text-itutor-green" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                ) : null}
              </div>
            </div>
            {usernameError && <p className="text-xs text-red-400 -mt-1">{usernameError}</p>}

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

            {/* Country */}
            <CountrySelect
              value={countryCode}
              onChange={setCountryCode}
              disabled={loading}
              className={`w-full bg-white border border-gray-200 text-sm py-2 px-4 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition ${!countryCode ? 'text-gray-400' : 'text-gray-900'} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            />

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-0">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  className={`${inputBase} pr-14`} placeholder="At least 8 characters" required disabled={loading} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 hover:text-gray-700 font-medium" tabIndex={-1}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-0">Confirm password</label>
              <div className="relative">
                <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${inputBase} pr-14`} placeholder="Re-enter your password" required disabled={loading} />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 hover:text-gray-700 font-medium" tabIndex={-1}>
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {/* Terms */}
            <div className="flex items-start gap-2.5">
              <input type="checkbox" id="terms" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-itutor-green rounded focus:ring-itutor-green border-gray-300" required disabled={loading} />
              <label htmlFor="terms" className="text-xs text-gray-500 leading-relaxed">
                I agree to the{' '}
                <a href="/terms/student" target="_blank" className="text-itutor-green font-medium hover:underline">Terms & Conditions</a>
              </label>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-itutor-green hover:bg-emerald-700 text-white py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? 'Creating your account...' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-1.5 text-center space-y-1">
            <p className="text-xs text-gray-600">
              Already have an account?{' '}
              <a href="/login" className="font-bold text-gray-900 hover:text-itutor-green transition-colors">Log in</a>
            </p>
            <p className="text-xs text-gray-400">
              Signing up for your child?{' '}
              <a href="/signup/parent" className="text-itutor-green font-medium hover:underline">Parent/guardian signup</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
