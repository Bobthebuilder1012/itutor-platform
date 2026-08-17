'use client';

/**
 * "Complete your profile" — the signup step between the questionnaire and
 * results (docs 03 §3.2).
 *
 * Google sits FIRST and most prominent: it is the path most visitors take,
 * and Google users are exempt from email verification — Google already
 * proved the address. The OAuth round trip navigates away from iTutor
 * entirely, so nothing here relies on page memory: the answers live
 * server-side against the HttpOnly cmw_token cookie, and the auth callback's
 * ?redirect= param (same-origin guarded) carries the visitor back to results,
 * where the submission is claimed onto the new account.
 *
 * Below a divider: email + password sign-UP, with a toggle to sign IN —
 * many visitors already have accounts from a previous term, and the same
 * restoration path applies. Role is NEVER asked (it is in the submission);
 * no phone number is collected. The form is deliberately minimal.
 */

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, Loader2, MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import type { SubmissionRole } from '@/lib/classMatchWeek/types';

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.44.35-2.1V7.07H2.18a11 11 0 0 0 0 9.87l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export default function CompleteProfile({
  role,
  sessionParam,
}: {
  role: SubmissionRole;
  sessionParam: string | null;
}) {
  const router = useRouter();
  const isParent = role === 'parent';

  const resultsPath = sessionParam
    ? `/class-match-week/results?session=${encodeURIComponent(sessionParam)}`
    : '/class-match-week/results';

  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  // Email-and-password signups verify before reserving; when signUp returns
  // no session, the confirmation link (emailRedirectTo → auth callback →
  // ?redirect=) brings them back authed, and the claim happens then.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 8;

  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(resultsPath)}`;

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError('');
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl(),
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (oauthError) {
      setError('Couldn’t connect to Google. Please try again.');
      setGoogleLoading(false);
    }
    // On success the browser navigates away; loading state holds until then.
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!emailValid) {
      setError('Enter a valid email address.');
      return;
    }
    if (mode === 'signup' && !passwordValid) {
      setError('Password needs at least 8 characters.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) {
          setError('That email and password don’t match. Try again, or create an account.');
          setLoading(false);
          return;
        }
        router.push(resultsPath);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: callbackUrl() },
      });
      if (signUpError) {
        setError(
          /already/i.test(signUpError.message)
            ? 'This email already has an account — sign in below instead.'
            : signUpError.message || 'Couldn’t create your account. Please try again.'
        );
        setLoading(false);
        return;
      }
      // Supabase obfuscates existing accounts as a user with no identities.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError('This email already has an account — sign in instead.');
        setMode('signin');
        setLoading(false);
        return;
      }
      if (data.session) {
        // Confirmation is off (or auto): they are signed in right now.
        router.push(resultsPath);
        return;
      }
      setAwaitingConfirmation(true);
      setLoading(false);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none';

  if (awaitingConfirmation) {
    return (
      <main className="min-h-screen bg-mint-wash px-4 pb-16 pt-16">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-border bg-white p-8 text-center shadow-card">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-deep">
            <MailCheck className="size-7" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">
            Check your inbox — your spot is saved
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            We sent a confirmation link to <span className="font-semibold text-ink">{email}</span>.
            Tap it and you&rsquo;ll land right back on {isParent ? 'your child’s' : 'your'} matches
            — your answers are kept safe in the meantime.
          </p>
          <p className="mt-4 text-xs text-ink-muted">
            Emails can take a minute. Check spam if you don&rsquo;t see it.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-mint-wash px-4 pb-16 pt-6">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/class-match-week"
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" /> Class Match Week
        </Link>

        <div className="mt-4 rounded-3xl border border-border bg-white p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Complete your profile</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {isParent
              ? 'One quick step so we can hold your child’s spot and show your matches.'
              : 'One quick step so we can hold your spot and show your matches.'}
          </p>

          {error && (
            <p className="mt-4 rounded-2xl border border-border bg-mint-wash px-4 py-3 text-xs font-semibold text-ink">
              {error}
            </p>
          )}

          {/* Google first — the primary path, and exempt from email verification. */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {googleLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <span className="flex size-6 items-center justify-center rounded-full bg-white">
                <GoogleIcon />
              </span>
            )}
            {googleLoading ? 'Connecting…' : 'Continue with Google'}
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                or use email
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className={inputClass}
            />
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Password — at least 8 characters' : 'Password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'signup' ? 8 : undefined}
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                tabIndex={-1}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted transition-colors hover:text-ink"
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="mt-1 w-full rounded-2xl border border-brand bg-brand-soft px-4 py-3.5 text-sm font-bold text-brand-deep transition-colors hover:bg-mint disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="mx-auto size-4 animate-spin" />
              ) : mode === 'signup' ? (
                'Create account'
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-ink-muted">
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError('');
                  }}
                  className="font-semibold text-brand-deep underline underline-offset-2"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                New to iTutor?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError('');
                  }}
                  className="font-semibold text-brand-deep underline underline-offset-2"
                >
                  Create an account
                </button>
              </>
            )}
          </p>
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-muted">
          Your questionnaire answers are already saved — signing {mode === 'signup' ? 'up' : 'in'}{' '}
          attaches them to your account.
        </p>
      </div>
    </main>
  );
}
