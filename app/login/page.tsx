'use client';

import { FormEvent, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Check } from 'lucide-react';
import { supabase, setRememberMePreference, createSupabaseClient } from '@/lib/supabase/client';
import { getAdminHomePath, isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === 'Failed to fetch') return true;
  if (error instanceof Error && (error.message.includes('network') || error.message.includes('fetch'))) return true;
  return typeof navigator !== 'undefined' ? !navigator.onLine : false;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  useEffect(() => {
    const emailSent = searchParams.get('emailSent');
    const confirmed = searchParams.get('confirmed');
    const userEmail = searchParams.get('email');
    const errorParam = searchParams.get('error');
    const messageParam = searchParams.get('message');
    const reasonParam = searchParams.get('reason');

    if (confirmed === 'true') {
      setBanner({ type: 'success', message: 'Email confirmed! You can now sign in.' });
      if (userEmail) setEmail(userEmail);
      return;
    }

    if (reasonParam === 'email_in_use') {
      if (userEmail) setEmail(userEmail);
      setError('This email is already in use. Please sign in instead.');
    }

    if (emailSent === 'true' && userEmail) {
      setBanner({ type: 'info', message: 'Account created! Check your email to verify before signing in.' });
      setEmail(userEmail);
    }

    if (errorParam) {
      const msgs: Record<string, string> = {
        oauth_failed: messageParam ? decodeURIComponent(messageParam) : 'Authentication failed. Please try again.',
        no_session: 'Unable to establish session. Please log in manually.',
        invalid_callback: 'Invalid authentication link. Please try logging in.',
        missing_code: 'Invalid authentication link. Please try logging in.',
        profile_fetch_failed: 'Unable to load your profile. Please contact support.',
        profile_creation_failed: 'Unable to create your profile. Please try again.',
      };
      setError(msgs[errorParam] || 'An error occurred. Please try logging in.');
    }
  }, [searchParams]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      setRememberMePreference(rememberMe);
      const supabaseClient = createSupabaseClient(rememberMe);

      const { data: authData, error: signInError } = await supabaseClient.auth.signInWithPassword({ email, password });

      if (signInError) {
        if (signInError.message.includes('Email not confirmed') || signInError.message.includes('not confirmed') || signInError.message.includes('verify your email')) {
          router.push(`/verify-code?email=${encodeURIComponent(email)}`);
          return;
        }
        setError(
          signInError.message.includes('Invalid login credentials') || signInError.message.includes('credentials')
            ? 'Incorrect email or password'
            : signInError.message
        );
        setLoading(false);
        return;
      }

      if (!authData.user) { setError('Unable to log in. Please try again.'); setLoading(false); return; }

      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles').select('*').eq('id', authData.user.id).maybeSingle();

      let profileData = profile;
      if (profileError || !profileData) {
        await fetch('/api/profile/ensure', { method: 'POST' }).catch(() => {});
        const { data: ensured, error: ensuredError } = await supabaseClient
          .from('profiles').select('*').eq('id', authData.user.id).maybeSingle();
        if (ensuredError || !ensured) { setError('Unable to fetch user profile.'); setLoading(false); return; }
        profileData = ensured;
      }

      if (!profileData.role) { router.push('/signup/complete-role'); return; }

      const redirectUrl = searchParams.get('redirect');

      if (isEmailManagementOnlyAdmin(profileData.email)) { router.push('/admin/emails'); return; }
      if (redirectUrl) { router.push(decodeURIComponent(redirectUrl)); return; }
      if (profileData.role === 'admin') { router.push(getAdminHomePath(profileData.email)); return; }
      if (profileData.is_reviewer) { router.push('/reviewer/dashboard'); return; }

      switch (profileData.role) {
        case 'student': {
          if (profileData.billing_mode === 'parent_required') { router.push('/student/dashboard'); break; }
          router.push(profileData.form_level ? '/student/dashboard' : '/signup/complete-role');
          break;
        }
        case 'parent': router.push('/parent/dashboard'); break;
        case 'tutor': router.push('/tutor/dashboard'); break;
        default: setError('Invalid user role.'); setLoading(false);
      }
    } catch (err) {
      setError(isNetworkError(err) ? 'Connect to the Internet' : 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen text-white" style={{ background: 'linear-gradient(135deg, #071a0e 0%, #0d2318 50%, #0a1e14 100%)' }}>
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:flex-row lg:items-stretch lg:p-8">

        {/* LEFT — brand panel */}
        <aside className="hidden flex-col justify-between rounded-3xl p-10 lg:flex lg:w-[55%]" style={{ backgroundColor: 'oklch(0.16 0.04 155)' }}>
          <Link href="/">
            <img src="/assets/logo/itutor-logo-new.png" alt="iTutor" className="h-14 w-auto object-contain" />
          </Link>

          <div className="space-y-6">
            <h1 className="font-display text-5xl font-bold leading-tight tracking-tight">
              Welcome back.<br />
              <span className="text-itutor-green">Let&apos;s keep learning.</span>
            </h1>
            <p className="max-w-md text-white/70">
              Pick up where you left off — your tutors, lessons and bookings are right here.
            </p>
            <ul className="space-y-3 text-sm text-white/80">
              {['Manage your 1:1 sessions and group lessons', 'Message your iTutors directly', 'Track progress across every subject'].map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(25,147,86,0.2)' }}>
                    <Check className="h-3 w-3 text-itutor-green" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/40">© iTutor 2026</p>
        </aside>

        {/* RIGHT — card */}
        <section className="flex-1 lg:w-[45%]">
          <div className="mx-auto flex h-full max-w-xl flex-col rounded-3xl bg-white text-gray-900 shadow-2xl">

            {/* Mobile header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 lg:hidden">
              <Link href="/">
                <img src="/assets/logo/itutor-logo-new.png" alt="iTutor" className="h-8 w-auto object-contain" />
              </Link>
              <Link href="/" className="text-xs font-medium text-gray-500">Back to site</Link>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-1 px-6 pb-8 pt-10 sm:px-10"
            >
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Log in</h2>
              <p className="mt-1.5 text-sm text-gray-500">Welcome back to iTutor.</p>

              {/* Banners */}
              {banner && (
                <div className={`mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 ${banner.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                  <p className="text-sm">{banner.message}</p>
                  <button onClick={() => setBanner(null)} className="ml-auto shrink-0 opacity-60 hover:opacity-100">✕</button>
                </div>
              )}

              {error && (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Google */}
              <GoogleOAuthButton className="mt-6" />

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-200" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-400">or</span>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" autoComplete="email" required disabled={loading}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-itutor-green focus:ring-2 focus:ring-green-100" />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <Link href="/forgot-password" className="text-xs font-medium text-itutor-green hover:underline">Forgot password?</Link>
                  </div>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password" autoComplete="current-password" required disabled={loading}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2.5 pr-10 text-sm outline-none transition focus:border-itutor-green focus:ring-2 focus:ring-green-100" />
                    <button type="button" onClick={() => setShowPw((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" id="rememberMe" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-itutor-green focus:ring-itutor-green" disabled={loading} />
                  <label htmlFor="rememberMe" className="cursor-pointer text-sm text-gray-500">Keep me signed in</label>
                </div>

                <button type="submit" disabled={loading || !email || !password}
                  className="w-full rounded-xl bg-itutor-green py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Signing in…
                    </span>
                  ) : 'Log in'}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-gray-500">
                New to iTutor?{' '}
                <Link href="/signup" className="font-medium text-itutor-green underline">Create an account</Link>
              </p>
            </motion.div>
          </div>
        </section>
      </div>
    </main>
  );
}

function GoogleOAuthButton({ className }: { className?: string }) {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState('');

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setGoogleError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) { setGoogleError('Failed to connect with Google. Please try again.'); setGoogleLoading(false); }
  };

  return (
    <div className={className}>
      <button type="button" onClick={handleGoogleLogin} disabled={googleLoading}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50">
        {googleLoading
          ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
          : <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.44.35-2.1V7.07H2.18a11 11 0 0 0 0 9.87l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>}
        {googleLoading ? 'Connecting…' : 'Continue with Google'}
      </button>
      {googleError && <p className="mt-1.5 text-center text-xs text-red-500">{googleError}</p>}
    </div>
  );
}
