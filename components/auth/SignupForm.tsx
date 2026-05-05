'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import SocialLoginButton from '@/components/SocialLoginButton';

interface SignupFormProps {
  onSwitchMode: () => void;
  onSuccess?: () => void;
  redirectTo?: string;
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === 'Failed to fetch') return true;
  if (error instanceof Error) {
    return (
      error.message.includes('network') ||
      error.message.includes('Network') ||
      error.message.includes('fetch')
    );
  }
  return typeof navigator !== 'undefined' ? !navigator.onLine : false;
}

export default function SignupForm({ onSwitchMode, onSuccess, redirectTo }: SignupFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(false);

  useEffect(() => {
    setUsernameError('');
    setUsernameAvailable(false);
    const trimmed = username.trim();
    if (!trimmed) return;
    if (trimmed.length < 3) { setUsernameError('Min 3 characters'); return; }
    if (trimmed.length > 30) { setUsernameError('Max 30 characters'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { setUsernameError('Letters, numbers, _ only'); return; }

    setUsernameChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/check-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: trimmed }),
        });
        const data = await res.json();
        if (data.usernameAvailable === false) setUsernameError('Username taken');
        else setUsernameAvailable(true);
      } catch { /* ignore */ } finally { setUsernameChecking(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [username]);

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }
    if (trimmedName.length > 120) {
      setError('Name must be 120 characters or less.');
      return;
    }

    const trimmedUsername = username.trim();
    if (!trimmedUsername || usernameError || !usernameAvailable) {
      setError('Please choose a valid, available username.');
      return;
    }

    setLoading(true);

    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: trimmedName,
            username: trimmedUsername,
            role: 'student',
          },
        },
      });

      if (signUpError) {
        const normalized = signUpError.message.toLowerCase();
        if (
          normalized.includes('already registered') ||
          normalized.includes('user already registered') ||
          normalized.includes('email already')
        ) {
          setError('This email is already in use. Please log in instead.');
        } else {
          setError(signUpError.message);
        }
        setLoading(false);
        return;
      }

      const identitiesCount = authData.user?.identities?.length ?? 0;
      if (identitiesCount === 0) {
        setError('This email is already in use. Please log in instead.');
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Unable to complete signup. Please try again.');
        setLoading(false);
        return;
      }

      if (!authData.session) {
        onSuccess?.();
        router.push(`/verify-code?email=${encodeURIComponent(email)}`);
        return;
      }

      const ensureRes = await fetch('/api/profile/ensure', { method: 'POST' });
      const ensureJson = (await ensureRes.json().catch(() => ({}))) as { error?: string };
      if (!ensureRes.ok) {
        setError(ensureJson.error || 'Error creating profile.');
        setLoading(false);
        return;
      }

      onSuccess?.();
      router.push(redirectTo || '/signup/complete-role');
    } catch (err) {
      if (isNetworkError(err)) setError('Connect to the Internet');
      else setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <SocialLoginButton
        provider="google"
        mode="signup"
        redirectTo="/auth/callback?next=/signup/complete-role"
      />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wide">
          <span className="bg-white px-2 text-gray-500">or continue with email</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSignup} className="space-y-3">
        <div>
          <label htmlFor="auth-signup-full-name" className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            id="auth-signup-full-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="John Doe"
            disabled={loading}
            required
            autoComplete="name"
            maxLength={120}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-itutor-green focus:border-itutor-green outline-none"
          />
        </div>

        <div>
          <label htmlFor="auth-signup-username" className="block text-sm font-medium text-gray-700 mb-1">
            Username
          </label>
          <div className="relative">
            <input
              id="auth-signup-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="johndoe123"
              disabled={loading}
              required
              autoComplete="username"
              minLength={3}
              maxLength={30}
              className={`w-full rounded-lg border px-3 py-2.5 pr-10 focus:ring-2 focus:ring-itutor-green focus:border-itutor-green outline-none ${
                usernameError
                  ? 'border-red-400'
                  : usernameAvailable && username
                  ? 'border-itutor-green'
                  : 'border-gray-300'
              }`}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {usernameChecking ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-itutor-green" />
              ) : usernameError ? (
                <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
              ) : usernameAvailable && username ? (
                <svg className="w-4 h-4 text-itutor-green" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              ) : null}
            </div>
          </div>
          {usernameError ? (
            <p className="mt-1 text-xs text-red-500">{usernameError}</p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">3-30 characters. Letters, numbers and underscores.</p>
          )}
        </div>

        <div>
          <label htmlFor="auth-signup-email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="auth-signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={loading}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:ring-2 focus:ring-itutor-green focus:border-itutor-green outline-none"
          />
        </div>

        <div>
          <label htmlFor="auth-signup-password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <div className="relative">
            <input
              id="auth-signup-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              disabled={loading}
              required
              minLength={8}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-10 focus:ring-2 focus:ring-itutor-green focus:border-itutor-green outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="auth-signup-confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm password
          </label>
          <div className="relative">
            <input
              id="auth-signup-confirm-password"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              disabled={loading}
              required
              minLength={8}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 pr-10 focus:ring-2 focus:ring-itutor-green focus:border-itutor-green outline-none"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm"
            >
              {showConfirmPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-itutor-green text-itutor-black font-semibold py-2.5 rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-60"
        >
          {loading ? 'Creating account...' : 'Sign Up'}
        </button>
      </form>

      <p className="text-sm text-center text-gray-600">
        Already have an account?{' '}
        <button type="button" onClick={onSwitchMode} className="text-itutor-green font-semibold hover:underline">
          Log in
        </button>
      </p>
    </div>
  );
}
