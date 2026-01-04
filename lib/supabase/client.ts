import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Lazy-load the Supabase client to prevent build-time env var access
let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    // Runtime check (browser only) - logs warning but doesn't throw
    if (typeof window !== 'undefined') {
      if (!supabaseUrl || !supabaseAnonKey) {
        console.error('❌ Supabase environment variables not set! Check your .env.local file.');
      }
    }

    supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  
  return supabaseInstance;
}

// Export as a getter to maintain backward compatibility
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabaseClient()[prop as keyof SupabaseClient];
  }
});