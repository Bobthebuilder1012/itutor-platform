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
            {/* Desk */}
            <rect x="40" y="200" width="340" height="14" rx="7" fill="#a7d7b8"/>
            {/* Laptop base */}
            <rect x="100" y="160" width="200" height="12" rx="6" fill="#4ade80"/>
            {/* Laptop screen */}
            <rect x="110" y="80" width="180" height="85" rx="10" fill="#1a2e1f"/>
            <rect x="118" y="88" width="164" height="69" rx="6" fill="#22c55e" opacity="0.15"/>
            {/* Screen content lines */}
            <rect x="128" y="98" width="80" height="8" rx="4" fill="#4ade80" opacity="0.7"/>
            <rect x="128" y="112" width="60" height="6" rx="3" fill="#4ade80" opacity="0.4"/>
            <rect x="128" y="124" width="70" height="6" rx="3" fill="#4ade80" opacity="0.4"/>
            {/* Chat bubble on screen */}
            <rect x="215" y="93" width="52" height="36" rx="8" fill="white" opacity="0.9"/>
            <path d="M221 129 l6 8 l4-8" fill="white" opacity="0.9"/>
            {/* Person avatar in bubble */}
            <circle cx="225" cy="104" r="6" fill="#4ade80"/>
            <rect x="236" y="100" width="25" height="4" rx="2" fill="#d1fae5"/>
            <rect x="236" y="108" width="18" height="3" rx="1.5" fill="#d1fae5"/>
            {/* Student 1 (boy) */}
            <circle cx="155" cy="145" r="20" fill="#fbbf24"/>
            <rect x="135" y="165" width="40" height="40" rx="8" fill="#22c55e"/>
            {/* Student 2 (girl) */}
            <circle cx="215" cy="148" r="18" fill="#f9a8d4"/>
            <rect x="197" y="166" width="36" height="38" rx="8" fill="#fbbf24"/>
            {/* Hair */}
            <path d="M135 140 q20-30 40 0" fill="#92400e"/>
            <path d="M197 140 q18-25 36 0" fill="#7c3aed" opacity="0.6"/>
            {/* Notebook */}
            <rect x="230" y="185" width="60" height="18" rx="4" fill="white" opacity="0.8"/>
            <line x1="240" y1="191" x2="282" y2="191" stroke="#4ade80" strokeWidth="1.5"/>
            <line x1="240" y1="197" x2="270" y2="197" stroke="#4ade80" strokeWidth="1.5"/>
            {/* Pencils */}
            <rect x="80" y="175" width="6" height="28" rx="3" fill="#fbbf24" transform="rotate(-15 83 189)"/>
            <rect x="70" y="178" width="6" height="28" rx="3" fill="#f87171" transform="rotate(-8 73 192)"/>
            {/* Lamp */}
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
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome</h2>
            <p className="text-sm text-gray-500">Sign up for your iTutor account</p>
          </div>

          {/* Tutor signup nudge */}
          <p className="text-xs text-gray-400 mb-4 text-center">
            Signing up to teach?{' '}
            <a href="/signup/tutor" className="text-itutor-green font-semibold hover:underline">Sign up as a tutor →</a>
          </p>

          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <div className="bg-red-900/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
                <p className="text-sm">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="fullName" className="block text-sm font-semibold text-gray-800 mb-1.5">
                Full name
              </label>
              <input
                type="text"
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none focus:bg-white transition placeholder-gray-400 text-sm"
                placeholder="Jane Doe"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-semibold text-gray-800 mb-1.5">
                Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`w-full px-4 py-3 pr-10 bg-gray-50 text-gray-900 rounded-xl focus:ring-2 focus:outline-none focus:bg-white transition placeholder-gray-400 text-sm border-2 ${
                    usernameError
                      ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
                      : usernameAvailable
                      ? 'border-itutor-green focus:ring-itutor-green focus:border-itutor-green'
                      : 'border-gray-200 focus:ring-itutor-green focus:border-itutor-green'
                  }`}
                  placeholder="janedoe123"
                  required
                  disabled={loading}
                  minLength={6}
                  maxLength={30}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameChecking ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-itutor-green"></div>
                  ) : usernameError ? (
                    <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  ) : usernameAvailable && username ? (
                    <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : null}
                </div>
              </div>
              {usernameError ? (
                <p className="mt-1 text-xs text-red-400">{usernameError}</p>
              ) : usernameAvailable && username ? (
                <p className="mt-1 text-xs text-green-500">✓ Username is available</p>
              ) : (
                <p className="mt-1 text-xs text-gray-400">6-30 characters. Only letters, numbers, _ and -</p>
              )}
            </div>

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
              <label htmlFor="country" className="block text-sm font-semibold text-gray-800 mb-1.5">
                Country
              </label>
              <CountrySelect
                value={countryCode}
                onChange={setCountryCode}
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-800 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-10 bg-gray-50 border-2 border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none focus:bg-white transition placeholder-gray-400 text-sm"
                  placeholder="Enter a secure password"
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

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-800 mb-1.5">
                Confirm password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-10 bg-gray-50 border-2 border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none focus:bg-white transition placeholder-gray-400 text-sm"
                  placeholder="Re-enter your password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
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

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="termsAccepted"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-itutor-green rounded focus:ring-itutor-green border-gray-300"
                required
                disabled={loading}
              />
              <label htmlFor="termsAccepted" className="text-xs text-gray-500 leading-relaxed">
                I agree to the{' '}
                <a
                  href="/terms/student"
                  target="_blank"
                  className="text-itutor-green hover:text-emerald-500 font-medium transition-colors underline"
                >
                  Terms & Conditions
                </a>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-itutor-green hover:bg-emerald-600 text-white py-3 px-4 rounded-xl focus:ring-4 focus:ring-itutor-green/30 focus:outline-none transition-all font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-itutor-green/20"
            >
              {loading ? 'Creating your account...' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-5 space-y-3 text-center">
            <p className="text-sm text-gray-500">
              Already have an account?{' '}
              <a href="/login" className="text-itutor-green font-bold hover:underline">Log in</a>
            </p>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
              <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">or</span></div>
            </div>

            <SocialLoginButton provider="google" mode="signup" redirectTo="/auth/callback?next=/signup/complete-role" />

            <p className="text-xs text-gray-400">
              Signing up for your child?{' '}
              <a href="/signup/parent" className="text-itutor-green font-medium hover:underline">Parent/guardian signup</a>
            </p>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
