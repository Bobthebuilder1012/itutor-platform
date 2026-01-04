import { createBrowserClient } from '@supabase/ssr';

// Environment variables are accessed directly by createBrowserClient at runtime
// Do NOT add build-time checks here - they will break Next.js build on Vercel
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Runtime check (browser only) - logs warning but doesn't throw
if (typeof window !== 'undefined') {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Supabase environment variables not set! Check your .env.local file.');
  }
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);