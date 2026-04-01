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

  const inputBase = "w-full bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400 text-sm py-3 px-4";
  const inputWithIcon = "w-full bg-white border border-gray-200 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400 text-sm py-3 pl-10 pr-4";

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#dff0e8' }}>
      {/* Decorative circles — scattered across full page */}
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
            {/* Floor/desk surface */}
            <rect x="20" y="232" width="440" height="16" rx="8" fill="#86c9a0" opacity="0.6"/>

            {/* Desk top */}
            <rect x="60" y="220" width="360" height="14" rx="7" fill="#a7d9bc"/>

            {/* Lamp pole */}
            <rect x="390" y="148" width="7" height="74" rx="3.5" fill="#9ca3af"/>
            {/* Lamp arm */}
            <rect x="370" y="144" width="28" height="7" rx="3.5" fill="#9ca3af" transform="rotate(-20 384 147)"/>
            {/* Lamp shade */}
            <ellipse cx="375" cy="130" rx="26" ry="13" fill="#4ade80" opacity="0.85"/>
            <ellipse cx="375" cy="130" rx="16" ry="8" fill="#bbf7d0"/>
            {/* Lamp glow */}
            <ellipse cx="375" cy="158" rx="30" ry="10" fill="#4ade80" opacity="0.08"/>

            {/* Pencil cup */}
            <rect x="72" y="196" width="26" height="28" rx="4" fill="#34d399" opacity="0.5"/>
            <rect x="77" y="178" width="5" height="22" rx="2.5" fill="#fbbf24" transform="rotate(-12 79 189)"/>
            <rect x="85" y="176" width="5" height="22" rx="2.5" fill="#f87171" transform="rotate(6 87 187)"/>
            <rect x="80" y="174" width="5" height="22" rx="2.5" fill="#60a5fa" transform="rotate(-3 82 185)"/>

            {/* Book stack */}
            <rect x="108" y="208" width="44" height="12" rx="3" fill="#6ee7b7"/>
            <rect x="111" y="198" width="38" height="12" rx="3" fill="#34d399"/>
            <rect x="114" y="188" width="32" height="12" rx="3" fill="#059669"/>

            {/* Laptop base */}
            <rect x="158" y="192" width="220" height="30" rx="8" fill="#4ade80" opacity="0.9"/>
            <rect x="168" y="196" width="200" height="22" rx="5" fill="#86efac" opacity="0.5"/>

            {/* Laptop screen */}
            <rect x="155" y="85" width="226" height="114" rx="12" fill="#1a2e1f"/>
            <rect x="163" y="93" width="210" height="98" rx="7" fill="#0f2218"/>
            {/* Screen glow tint */}
            <rect x="163" y="93" width="210" height="98" rx="7" fill="#22c55e" opacity="0.08"/>

            {/* Screen content */}
            <rect x="175" y="108" width="90" height="9" rx="4.5" fill="#4ade80" opacity="0.75"/>
            <rect x="175" y="124" width="70" height="7" rx="3.5" fill="#4ade80" opacity="0.4"/>
            <rect x="175" y="137" width="80" height="7" rx="3.5" fill="#4ade80" opacity="0.35"/>
            <rect x="175" y="150" width="55" height="7" rx="3.5" fill="#4ade80" opacity="0.3"/>

            {/* Chat bubble on screen */}
            <rect x="267" y="98" width="90" height="56" rx="10" fill="white" opacity="0.92"/>
            <path d="M273 154 l8 12 l6-12" fill="white" opacity="0.92"/>
            {/* Avatar circle in bubble */}
            <circle cx="283" cy="116" r="9" fill="#4ade80"/>
            <circle cx="283" cy="113" r="3.5" fill="white" opacity="0.9"/>
            <path d="M277 122 q6-4 12 0" stroke="white" strokeWidth="1.2" fill="none" opacity="0.8"/>
            {/* Text lines in bubble */}
            <rect x="297" y="110" width="52" height="5" rx="2.5" fill="#d1fae5"/>
            <rect x="297" y="120" width="40" height="4" rx="2" fill="#d1fae5" opacity="0.7"/>
            <rect x="272" y="133" width="78" height="4" rx="2" fill="#d1fae5" opacity="0.5"/>
            <rect x="272" y="141" width="60" height="4" rx="2" fill="#d1fae5" opacity="0.4"/>

            {/* Hinge */}
            <rect x="245" y="195" width="50" height="6" rx="3" fill="#16a34a" opacity="0.6"/>

            {/* Boy student */}
            {/* Body */}
            <rect x="162" y="180" width="58" height="46" rx="10" fill="#16a34a"/>
            {/* Head */}
            <circle cx="191" cy="158" r="25" fill="#fde68a"/>
            {/* Hair */}
            <path d="M166 152 q25-38 50 0" fill="#92400e"/>
            {/* Eyes */}
            <circle cx="183" cy="156" r="2.5" fill="#1f2937"/>
            <circle cx="199" cy="156" r="2.5" fill="#1f2937"/>
            {/* Smile */}
            <path d="M184 165 q7 6 14 0" stroke="#d97706" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
            {/* Arm reaching to laptop */}
            <rect x="216" y="186" width="40" height="14" rx="7" fill="#fde68a" transform="rotate(-10 236 193)"/>

            {/* Girl student */}
            {/* Body */}
            <rect x="268" y="180" width="56" height="46" rx="10" fill="#fbbf24"/>
            {/* Head */}
            <circle cx="296" cy="160" r="23" fill="#fecdd3"/>
            {/* Hair */}
            <path d="M273 156 q23-34 46 0" fill="#7c3aed" opacity="0.55"/>
            {/* Ponytail */}
            <path d="M319 158 q12-6 10 10" stroke="#7c3aed" strokeWidth="7" strokeLinecap="round" fill="none" opacity="0.5"/>
            {/* Eyes */}
            <circle cx="288" cy="158" r="2.3" fill="#1f2937"/>
            <circle cx="304" cy="158" r="2.3" fill="#1f2937"/>
            {/* Smile */}
            <path d="M289 167 q7 5 14 0" stroke="#be185d" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
            {/* Arm with pencil */}
            <rect x="232" y="185" width="38" height="13" rx="6.5" fill="#fecdd3" transform="rotate(8 251 191)"/>
            <rect x="262" y="194" width="4" height="18" rx="2" fill="#fbbf24" transform="rotate(15 264 203)"/>

            {/* Notebook */}
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
            <p className="text-sm text-gray-500">Sign up for your iTutor account</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2.5 rounded-lg mb-4">
              <p className="text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-3.5">
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
            {usernameError && <p className="text-xs text-red-400 -mt-2">{usernameError}</p>}

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
            <CountrySelect value={countryCode} onChange={setCountryCode} disabled={loading} />

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
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
              className="w-full bg-itutor-green hover:bg-emerald-700 text-white py-3 rounded-lg font-bold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1">
              {loading ? 'Creating your account...' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-4 text-center space-y-3">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <a href="/login" className="font-bold text-gray-900 hover:text-itutor-green transition-colors">Log in</a>
            </p>

            <SocialLoginButton provider="google" mode="signup" redirectTo="/auth/callback?next=/signup/complete-role" />

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
