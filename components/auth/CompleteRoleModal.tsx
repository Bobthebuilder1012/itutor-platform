'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

type SelectableRole = 'student' | 'tutor' | 'parent';

interface CompleteRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CompleteRoleModal({ isOpen, onClose }: CompleteRoleModalProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [loadingRole, setLoadingRole] = useState<SelectableRole | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, username')
        .eq('id', data.session.user.id)
        .maybeSingle();

      if (profile?.role === 'student') {
        router.replace('/onboarding/student');
        return;
      }
      if (profile?.role === 'tutor') {
        router.replace('/onboarding/tutor');
        return;
      }
      if (profile?.role === 'parent') {
        router.replace('/parent/dashboard');
        return;
      }

      setUserId(data.session.user.id);
      setUsername(profile?.username ?? '');
      setReady(true);
    };

    checkSession().catch(() => {
      router.replace('/login');
    });
  }, [isOpen, router]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!ready || !userId) return;

    const validateAndCheck = async () => {
      const trimmed = username.trim();
      setUsernameError('');
      setUsernameAvailable(false);

      if (!trimmed) return;
      if (trimmed.length < 6) {
        setUsernameError('Username must be at least 6 characters');
        return;
      }
      if (trimmed.length > 30) {
        setUsernameError('Username must be 30 characters or less');
        return;
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        setUsernameError('Only letters, numbers, _ and - allowed');
        return;
      }

      setUsernameChecking(true);
      try {
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', trimmed)
          .neq('id', userId)
          .maybeSingle();

        if (existing) {
          setUsernameError('This username is already taken');
          setUsernameAvailable(false);
        } else {
          setUsernameAvailable(true);
        }
      } catch {
        setUsernameAvailable(false);
      } finally {
        setUsernameChecking(false);
      }
    };

    const timer = setTimeout(validateAndCheck, 350);
    return () => clearTimeout(timer);
  }, [username, ready, userId]);

  const handleRoleSelect = async (role: SelectableRole) => {
    setError('');
    const trimmedUsername = username.trim();
    if (!trimmedUsername || usernameError || !usernameAvailable || usernameChecking) {
      setError('Please enter a valid, available username before selecting a role.');
      return;
    }
    setLoadingRole(role);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', user.id)
        .maybeSingle();

      const fallbackName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        (user.email ? user.email.split('@')[0] : null) ||
        'User';
      const fullName = existingProfile?.full_name || fallbackName;
      const email = existingProfile?.email || user.email;

      if (!email) throw new Error('Unable to determine account email for profile update.');

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            email,
            full_name: fullName,
            username: trimmedUsername,
            role,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      if (profileError) throw profileError;

      const { error: userError } = await supabase.auth.updateUser({
        data: { role, username: trimmedUsername },
      });
      if (userError) throw userError;

      if (role === 'student') router.replace('/onboarding/student');
      else if (role === 'tutor') router.replace('/onboarding/tutor');
      else router.replace('/parent/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Unable to save your role. Please try again.');
      setLoadingRole(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110]">
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close role selection"
      />
      <div className="relative h-full w-full flex items-center justify-center p-4">
        <div
          className="relative bg-black border border-gray-700 rounded-2xl shadow-2xl p-8 max-w-xl w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Close role selection"
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <span className="text-xl leading-none">×</span>
          </button>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-itutor-white mb-2">Continue as</h1>
            <p className="text-gray-400">Choose your role to finish signing up</p>
          </div>

          {!ready ? (
            <p className="text-sm text-gray-300 text-center">Preparing your account...</p>
          ) : (
            <>
              <div className="mb-5">
                <label htmlFor="google-role-username" className="block text-sm font-medium text-gray-200 mb-2">
                  Username
                </label>
                <div className="relative">
                  <input
                    id="google-role-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose a unique username"
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 text-white px-3 py-2.5 pr-10 focus:ring-2 focus:ring-itutor-green focus:border-itutor-green outline-none"
                    disabled={loadingRole !== null}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                    {usernameChecking ? (
                      <span className="text-gray-400">...</span>
                    ) : username && usernameAvailable ? (
                      <span className="text-green-400">OK</span>
                    ) : null}
                  </div>
                </div>
                {usernameError ? (
                  <p className="mt-1 text-xs text-red-400">{usernameError}</p>
                ) : username && usernameAvailable ? (
                  <p className="mt-1 text-xs text-green-400">Username is available</p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">6-30 characters. Only letters, numbers, _ and -</p>
                )}
              </div>

              {error && (
                <div className="mb-5 bg-red-900/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleRoleSelect('student')}
                  disabled={loadingRole !== null || !usernameAvailable || !!usernameError || usernameChecking}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 hover:bg-gray-800 text-left p-5 transition-colors disabled:opacity-60"
                >
                  <p className="text-lg font-semibold text-white">Student</p>
                  <p className="text-sm text-gray-400 mt-1">Find tutors and book sessions.</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleSelect('tutor')}
                  disabled={loadingRole !== null || !usernameAvailable || !!usernameError || usernameChecking}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 hover:bg-gray-800 text-left p-5 transition-colors disabled:opacity-60"
                >
                  <p className="text-lg font-semibold text-white">Tutor</p>
                  <p className="text-sm text-gray-400 mt-1">Create your tutor profile and teach.</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleSelect('parent')}
                  disabled={loadingRole !== null || !usernameAvailable || !!usernameError || usernameChecking}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 hover:bg-gray-800 text-left p-5 transition-colors disabled:opacity-60 sm:col-span-2"
                >
                  <p className="text-lg font-semibold text-white">Parent/Guardian</p>
                  <p className="text-sm text-gray-400 mt-1">Manage your child&apos;s tutoring and bookings.</p>
                </button>
              </div>

              {loadingRole && (
                <p className="text-sm text-gray-400 mt-5 text-center">Saving your role...</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
