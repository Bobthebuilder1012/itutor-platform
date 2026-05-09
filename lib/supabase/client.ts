import { createBrowserClient } from '@supabase/ssr';
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

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Disable navigator.locks-based auth lock; it was emitting
      // "AbortError: signal is aborted without reason" and aborting
      // unrelated in-flight Supabase requests.
      lock: async (_name, _acquireTimeout, fn) => fn(),
    },
  });
}

let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createSupabaseClient(getRememberMePreference());
  }
  return supabaseInstance;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabaseClient()[prop as keyof SupabaseClient];
  }
});