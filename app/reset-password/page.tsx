'use client';

import { FormEvent, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // Check if user has a valid session (came from email link)
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          setValidSession(true);
        } else {
          setError('Invalid or expired reset link. Please request a new one.');
        }
      } catch (err) {
        setError('Failed to verify reset link. Please try again.');
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      setSuccess(true);
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err) {
      setError('Failed to reset password. Please try again.');
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-itutor-black flex items-center justify-center p-4">
        <div className="bg-gray-800/50 backdrop-blur-md border-2 border-gray-700 rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center">
            <div className="animate-spin w-12 h-12 border-4 border-itutor-green border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-400">Verifying reset link...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!validSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-itutor-black flex items-center justify-center p-4">
        <div className="bg-gray-800/50 backdrop-blur-md border-2 border-gray-700 rounded-2xl shadow-2xl p-8 sm:p-12 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="mb-6 flex justify-center">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-itutor-white mb-2">Invalid Reset Link</h1>
            <p className="text-gray-400 mb-6">{error}</p>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-200 mb-2 font-medium">What to do:</p>
            <ul className="text-sm text-yellow-300/90 space-y-1 list-disc list-inside">
              <li>Reset links expire after 1 hour</li>
              <li>Each link can only be used once</li>
              <li>Request a new reset link below</li>
            </ul>
          </div>

          <div className="space-y-3">
            <Link
              href="/forgot-password"
              className="block w-full text-center bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-3 px-4 rounded-lg font-semibold transition-all shadow-lg shadow-itutor-green/20"
            >
              Request new reset link
            </Link>
            
            <Link
              href="/login"
              className="block w-full text-center bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium transition-colors"
            >
              Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-itutor-black flex items-center justify-center p-4">
        <div className="bg-gray-800/50 backdrop-blur-md border-2 border-gray-700 rounded-2xl shadow-2xl p-8 sm:p-12 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="mb-6 flex justify-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-itutor-white mb-2">Password reset!</h1>
            <p className="text-gray-400 mb-6">
              Your password has been successfully reset.
            </p>
          </div>

          <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-200 text-center">
              Redirecting to login page...
            </p>
          </div>

          <Link
            href="/login"
            className="block w-full text-center bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-3 px-4 rounded-lg font-semibold transition-all shadow-lg shadow-itutor-green/20"
          >
            Go to login now
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-itutor-black flex items-center justify-center p-4">
      <div className="bg-gray-800/50 backdrop-blur-md border-2 border-gray-700 rounded-2xl shadow-2xl p-8 sm:p-12 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-4 flex justify-center">
            <img 
              src="/assets/logo/itutor-logo-dark.png" 
              alt="iTutor Logo" 
              className="h-12 w-auto"
            />
          </div>
          <h1 className="text-4xl font-bold text-itutor-white mb-2 tracking-tight">Create new password</h1>
          <p className="text-gray-400">Choose a strong password for your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-900/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg backdrop-blur-sm">
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              New Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 text-itutor-white rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-500"
              placeholder="At least 8 characters"
              required
              disabled={loading}
              minLength={8}
            />
            <p className="text-xs text-gray-500 mt-1">Must be at least 8 characters long</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
              Confirm New Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 text-itutor-white rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-500"
              placeholder="Re-enter your new password"
              required
              disabled={loading}
            />
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
                Resetting password...
              </span>
            ) : (
              'Reset password'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm text-gray-400 hover:text-gray-300 transition-colors">
            ← Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}


