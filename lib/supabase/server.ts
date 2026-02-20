// =====================================================
// SERVER-SIDE SUPABASE CLIENT
// =====================================================
// Use service role key for backend operations that bypass RLS
// Use getServerClient() for RLS as the logged-in user (API routes, server components)

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Get a Supabase client with service role key
 * This bypasses Row Level Security (RLS) policies
 * USE ONLY IN SERVER-SIDE CODE (API routes, server components)
 */
export function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

/**
 * Get a Supabase client with the current user's session (respects RLS)
 * Use in server components and API routes when you need auth context
 */
export async function getServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}













