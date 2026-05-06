import { createSupabaseClient } from './supabase';

// Key for storing the "remember me" preference in localStorage
const REMEMBER_ME_KEY = 'itutor_remember_me';

/**
 * Gets the user's "Keep me signed in" preference from localStorage.
 * @returns true if user wants persistent session, false otherwise
 */
export function getRememberMePreference(): boolean {
  if (typeof window === 'undefined') return false;
  const value = localStorage.getItem(REMEMBER_ME_KEY);
  return value === 'true';
}

/**
 * Stores the user's "Keep me signed in" preference.
 * @param rememberMe - true to keep user signed in across browser restarts
 */
export function setRememberMePreference(rememberMe: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REMEMBER_ME_KEY, String(rememberMe));
}

/**
 * Clears the "Keep me signed in" preference.
 */
function clearRememberMePreference(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(REMEMBER_ME_KEY);
}

/**
 * Signs in a user with email and password.
 * 
 * @param email - User's email address
 * @param password - User's password
 * @param rememberMe - If true, session persists across browser restarts (localStorage).
 *                     If false, session ends when tab closes (sessionStorage).
 * @returns Object with user, session, and any error
 * 
 * Example:
 * ```ts
 * const { user, session, error } = await signInWithEmail(
 *   'user@example.com',
 *   'password123',
 *   true // Keep me signed in
 * );
 * ```
 */
export async function signInWithEmail(
  email: string,
  password: string,
  rememberMe: boolean
) {
  // Store the preference BEFORE signing in
  setRememberMePreference(rememberMe);

  // Create client with appropriate storage
  const supabase = createSupabaseClient(rememberMe);

  // Sign in
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Clear preference if sign-in failed
    clearRememberMePreference();
    return { user: null, session: null, error };
  }

  return {
    user: data.user,
    session: data.session,
    error: null,
  };
}

/**
 * Signs out the current user and clears all session data.
 * Clears both localStorage and sessionStorage to ensure no leftover sessions.
 * 
 * @returns Object with any error
 */
export async function signOut() {
  // Get the current preference to use the correct client
  const rememberMe = getRememberMePreference();
  const supabase = createSupabaseClient(rememberMe);

  // Sign out
  const { error } = await supabase.auth.signOut();

  // Clear the preference
  clearRememberMePreference();

  // Clear both storage types to ensure complete logout
  if (typeof window !== 'undefined') {
    // Clear Supabase session keys from both storages
    const supabaseRef = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
      : '';
    const keysToRemove = [
      `sb-${supabaseRef}-auth-token`,
      REMEMBER_ME_KEY,
    ];
    
    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  }

  return { error };
}

/**
 * Gets the current session using the stored preference.
 * Call this on app load to auto-login if a valid session exists.
 * 
 * @returns Object with user, session, and any error
 */
export async function getCurrentSession() {
  const rememberMe = getRememberMePreference();
  const supabase = createSupabaseClient(rememberMe);

  const { data, error } = await supabase.auth.getSession();

  return {
    user: data.session?.user ?? null,
    session: data.session,
    error,
  };
}
