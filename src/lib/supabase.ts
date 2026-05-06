import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Creates a Supabase client with configurable session persistence.
 * 
 * @param persistSession - If true, uses localStorage (survives browser restart).
 *                         If false, uses sessionStorage (ends when tab closes).
 * @returns Configured Supabase client
 * 
 * Usage:
 * - When user checks "Keep me signed in": createSupabaseClient(true)
 * - When unchecked or by default: createSupabaseClient(false)
 */
export function createSupabaseClient(persistSession: boolean = false): SupabaseClient {
  // Choose storage based on persistence preference
  const storage = persistSession
    ? typeof window !== 'undefined' ? window.localStorage : undefined
    : typeof window !== 'undefined' ? window.sessionStorage : undefined;

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

/**
 * Default Supabase client (uses sessionStorage - session ends on tab close).
 * For most operations, use createSupabaseClient() with the user's preference instead.
 */
export const supabase = createSupabaseClient(false);
