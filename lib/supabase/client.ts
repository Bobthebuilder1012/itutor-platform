import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (typeof window !== 'undefined') {
  console.log('🔍 Supabase Config Check:');
  console.log('URL:', supabaseUrl || 'MISSING');
  console.log('Key present:', !!supabaseAnonKey);
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Supabase environment variables not set! Did you restart the dev server?');
  }
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env.local file and restart dev server.');
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);