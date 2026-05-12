import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { createSupabaseClient } from '../lib/supabase';
import {
  signInWithEmail as authSignIn,
  signOut as authSignOut,
  getCurrentSession,
  getRememberMePreference,
} from '../lib/auth';

export interface UseAuthResult {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string, rememberMe: boolean) => Promise<{
    user: User | null;
    session: Session | null;
    error: Error | null;
  }>;
  signOut: () => Promise<{ error: Error | null }>;
}

/**
 * Auth hook that manages user session state and handles auto-login.
 * 
 * Features:
 * - Auto-login on mount if valid session exists
 * - Listens to auth state changes (login, logout, token refresh)
 * - Respects "Keep me signed in" preference (localStorage vs sessionStorage)
 * 
 * Usage:
 * ```tsx
 * function App() {
 *   const { user, session, loading, signIn, signOut } = useAuth();
 * 
 *   if (loading) return <div>Loading...</div>;
 *   if (!user) return <LoginForm onSignIn={signIn} />;
 *   return <Dashboard user={user} onSignOut={signOut} />;
 * }
 * ```
 */
export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Sign in wrapper
  const signIn = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      const result = await authSignIn(email, password, rememberMe);
      if (result.user) {
        setUser(result.user);
        setSession(result.session);
      }
      return result;
    },
    []
  );

  // Sign out wrapper
  const signOut = useCallback(async () => {
    const result = await authSignOut();
    setUser(null);
    setSession(null);
    return result;
  }, []);

  useEffect(() => {
    // Get the user's preference and create the appropriate client
    const rememberMe = getRememberMePreference();
    const supabase = createSupabaseClient(rememberMe);

    // Auto-login: check for existing session on mount
    getCurrentSession()
      .then(({ user, session }) => {
        setUser(user);
        setSession(session);
      })
      .finally(() => {
        setLoading(false);
      });

    // Listen to auth state changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setSession(session);
    });

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    session,
    loading,
    signIn,
    signOut,
  };
}
