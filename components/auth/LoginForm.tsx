'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  getAdminHomePath,
  isEmailManagementOnlyAdmin,
} from '@/lib/auth/adminAccess';
import SocialLoginButton from '@/components/SocialLoginButton';

interface LoginFormProps {
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

export default function LoginForm({ onSwitchMode, onSuccess, redirectTo }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !data.user) {
        setError('Incorrect email or password');
        setLoading(false);
        return;
      }

      const userId = data.user.id;
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      let resolvedProfile = profile;
      if (profileError || !resolvedProfile) {
        await fetch('/api/profile/ensure', { method: 'POST' }).catch(() => {});
        const { data: ensuredProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        resolvedProfile = ensuredProfile;
      }

      const role = resolvedProfile?.role;
      const isReviewer = !!resolvedProfile?.is_reviewer;
      const isEmailOnly = isEmailManagementOnlyAdmin(resolvedProfile?.email);

      if (isEmailOnly) {
        onSuccess?.();
        router.push('/admin/emails');
        return;
      }

      if (redirectTo) {
        onSuccess?.();
        router.push(redirectTo);
        return;
      }

      if (role === 'admin') {
        onSuccess?.();
        router.push(getAdminHomePath(resolvedProfile?.email));
        return;
      }

      if (isReviewer) {
        onSuccess?.();
        router.push('/reviewer/dashboard');
        return;
      }

      switch (role) {
        case 'student':
          onSuccess?.();
          router.push('/student/dashboard');
          return;
        case 'parent':
          onSuccess?.();
          router.push('/parent/dashboard');
          return;
        case 'tutor':
          onSuccess?.();
          router.push('/tutor/dashboard');
          return;
        default:
          onSuccess?.();
          router.push('/signup');
      }
    } catch (err) {
      if (isNetworkError(err)) setError('Connect to the Internet');
      else setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <SocialLoginButton provider="google" mode="login" />

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

      <form onSubmit={handleLogin} className="space-y-3">
        <div>
          <label htmlFor="auth-login-email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="auth-login-email"
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
          <label htmlFor="auth-login-password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <div className="relative">
            <input
              id="auth-login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
              required
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

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-itutor-green text-itutor-black font-semibold py-2.5 rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-60"
        >
          {loading ? 'Signing in...' : 'Log In'}
        </button>
      </form>

      <p className="text-sm text-center text-gray-600">
        Don&apos;t have an account?{' '}
        <button type="button" onClick={onSwitchMode} className="text-itutor-green font-semibold hover:underline">
          Sign up
        </button>
      </p>
    </div>
  );
}
