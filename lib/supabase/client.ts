import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const REMEMBER_ME_KEY = 'itutor_remember_me';

/**
 * Gets the user's "Keep me signed in" preference from localStorage.
 * @returns true if user wants persistent session, false otherwise
 */
export function getRememberMePreference(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(REMEMBER_ME_KEY) === 'true';
}

/**
 * Stores the user's "Keep me signed in" preference.
 * @param remember - true to keep user signed in across browser restarts
 */
export function setRememberMePreference(remember: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REMEMBER_ME_KEY, String(remember));
}

/**
 * Clears the "Keep me signed in" preference.
 */
export function clearRememberMePreference(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(REMEMBER_ME_KEY);
}

/**
 * Creates a Supabase client with configurable session persistence.
 * 
 * @param persistSession - If true, uses localStorage (survives browser restart).
 *                         If false, uses sessionStorage (ends when tab closes).
 * @returns Configured Supabase client
 */
export function createSupabaseClient(persistSession: boolean = false): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  // Runtime check (browser only) - logs warning but doesn't throw
  if (typeof window !== 'undefined') {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('❌ Supabase environment variables not set! Check your .env.local file.');
    }
  }

  // Use the standard createClient with localStorage/sessionStorage
  const storage = persistSession
    ? (typeof window !== 'undefined' ? window.localStorage : undefined)
    : (typeof window !== 'undefined' ? window.sessionStorage : undefined);

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

// Cache the client based on current storage preference
let supabaseInstance: SupabaseClient | null = null;
let currentStorageMode: boolean | null = null;

// Don't cache the default client - always create it based on current preference
// This ensures the client uses the correct storage (localStorage or sessionStorage)
function getSupabaseClient(): SupabaseClient {
  // Always check current preference
  const rememberMe = getRememberMePreference();
  
  // Only recreate client if storage preference changed or no client exists
  if (!supabaseInstance || currentStorageMode !== rememberMe) {
    currentStorageMode = rememberMe;
    supabaseInstance = createSupabaseClient(rememberMe);
  }
  
  return supabaseInstance;
}

// Export as a getter to maintain backward compatibility
// This will automatically use the right storage based on current user preference
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabaseClient()[prop as keyof SupabaseClient];
  }
});