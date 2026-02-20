'use client';

import { FormEvent, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import CountrySelect from '@/components/CountrySelect';

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
    <div className="min-h-screen flex items-center justify-center bg-white px-3 py-4 sm:px-4 sm:py-8 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-20 left-10 w-72 h-72 bg-itutor-green rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-emerald-500 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>
      
      <div className="bg-black border border-gray-700 rounded-2xl shadow-2xl p-4 sm:p-8 md:p-10 max-w-2xl w-full relative z-10 backdrop-blur-sm">
        <div className="text-center mb-4 sm:mb-6 md:mb-8">
          <img
            src="/assets/logo/itutor-logo-dark.png"
            alt="iTutor"
            className="h-16 sm:h-24 md:h-32 w-auto mx-auto mb-3 sm:mb-4 md:mb-6 drop-shadow-2xl"
          />
          <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-itutor-white mb-1 sm:mb-2">Create your iTutor account</h1>
          <p className="text-sm sm:text-base text-itutor-muted mb-3">Sign up as a student to get started.</p>
          <a 
            href="/signup/tutor" 
            className="inline-block text-base sm:text-lg font-semibold text-itutor-green hover:text-emerald-400 transition-colors underline underline-offset-4 decoration-2 hover:scale-105 transform duration-200"
          >
            or sign up as a tutor instead →
          </a>
        </div>

        <form onSubmit={handleSignup} className="space-y-3 sm:space-y-4 md:space-y-5">
          {error && (
            <div className="bg-red-900/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg backdrop-blur-sm">
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="fullName" className="block text-xs sm:text-sm font-medium text-itutor-white mb-1 sm:mb-2">
              Full name
            </label>
            <input
              type="text"
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 sm:px-4 sm:py-3 text-sm sm:text-base bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition-all duration-200 placeholder:text-gray-400 text-itutor-white backdrop-blur-sm hover:bg-gray-900/70"
              placeholder="Jane Doe"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="username" className="block text-xs sm:text-sm font-medium text-itutor-white mb-1 sm:mb-2">
              Username
            </label>
            <div className="relative">
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`w-full px-3 py-2 sm:px-4 sm:py-3 pr-9 sm:pr-10 text-sm sm:text-base bg-gray-900/50 border rounded-lg focus:ring-2 focus:outline-none transition-all duration-200 placeholder:text-gray-400 text-itutor-white backdrop-blur-sm hover:bg-gray-900/70 ${
                  usernameError
                    ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                    : usernameAvailable
                    ? 'border-green-500 focus:ring-itutor-green focus:border-itutor-green'
                    : 'border-gray-600 focus:ring-itutor-green focus:border-itutor-green'
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
              <p className="mt-1 text-xs text-green-400">✓ Username is available</p>
            ) : (
              <p className="mt-1 text-xs text-gray-400">6-30 characters. Only letters, numbers, _ and -</p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="block text-xs sm:text-sm font-medium text-itutor-white mb-1 sm:mb-2">
              Email address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 sm:px-4 sm:py-3 text-sm sm:text-base bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition-all duration-200 placeholder:text-gray-400 text-itutor-white backdrop-blur-sm hover:bg-gray-900/70"
              placeholder="you@example.com"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="country" className="block text-xs sm:text-sm font-medium text-itutor-white mb-1 sm:mb-2">
              Country
            </label>
            <CountrySelect
              value={countryCode}
              onChange={setCountryCode}
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs sm:text-sm font-medium text-itutor-white mb-1 sm:mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 sm:px-4 sm:py-3 pr-9 sm:pr-10 text-sm sm:text-base bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition-all duration-200 placeholder:text-gray-400 text-itutor-white backdrop-blur-sm hover:bg-gray-900/70"
                placeholder="Enter a secure password"
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

          <div>
            <label htmlFor="confirmPassword" className="block text-xs sm:text-sm font-medium text-itutor-white mb-1 sm:mb-2">
              Confirm password
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 sm:px-4 sm:py-3 pr-9 sm:pr-10 text-sm sm:text-base bg-gray-900/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition-all duration-200 placeholder:text-gray-400 text-itutor-white backdrop-blur-sm hover:bg-gray-900/70"
                placeholder="Re-enter your password"
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
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
              className="w-5 h-5 mt-0.5 text-itutor-green rounded focus:ring-itutor-green bg-gray-900 border-gray-600"
              required
              disabled={loading}
            />
            <label htmlFor="termsAccepted" className="text-sm text-itutor-muted leading-relaxed">
              I agree to the{' '}
              <a 
                href="/terms/student" 
                target="_blank"
                className="text-itutor-green hover:text-emerald-400 font-medium transition-colors underline"
              >
                Terms & Conditions
              </a>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-itutor-green to-emerald-500 text-itutor-black py-2.5 sm:py-3 px-4 rounded-lg hover:shadow-lg hover:shadow-itutor-green/50 hover:scale-[1.02] focus:ring-4 focus:ring-itutor-green/30 focus:outline-none transition-all duration-300 font-bold text-base sm:text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating your account...' : 'Sign up'}
          </button>
        </form>

        <div className="mt-4 sm:mt-6 text-center space-y-2 sm:space-y-3">
          <p className="text-xs sm:text-sm text-itutor-muted">
            Signing up for your child?{' '}
            <a href="/signup/parent" className="text-itutor-green hover:text-emerald-400 font-medium transition-colors">
              Sign up as a parent/guardian
            </a>
          </p>
          <p className="text-xs sm:text-sm text-itutor-muted">
            Already have an account?{' '}
            <a href="/login" className="text-itutor-green hover:text-emerald-400 font-medium transition-colors">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}


