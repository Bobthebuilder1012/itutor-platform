// =====================================================
// SERVER-SIDE SUPABASE CLIENT
// =====================================================
// Use service role key for backend operations that bypass RLS

import { createClient } from '@supabase/supabase-js';

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













