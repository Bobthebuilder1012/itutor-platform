// =====================================================
// ADMIN AUTHENTICATION MIDDLEWARE
// =====================================================
// Checks if user has admin/reviewer privileges
// Admin role: profiles.is_reviewer = true OR profiles.role = 'admin'

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function requireAdmin() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component can't set cookies
          }
        },
      },
    }
  );

  // Check if user is authenticated - use getUser() instead of getSession()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      user: null,
      profile: null,
    };
  }

  // Check if user has admin privileges
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, is_reviewer, full_name, email')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('Profile not found for user:', user.id, profileError);
    return {
      error: NextResponse.json({ error: 'Profile not found' }, { status: 404 }),
      user,
      profile: null,
    };
  }

  // Check admin privileges: is_reviewer = true OR role = 'admin'
  if (!profile.is_reviewer && profile.role !== 'admin') {
    console.error('User lacks admin privileges:', profile);
    return {
      error: NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 }),
      user,
      profile,
    };
  }

  console.log('Admin authentication successful:', profile.email);

  return {
    error: null,
    user,
    profile,
  };
}

export async function isAdmin(userId: string): Promise<boolean> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component can't set cookies
          }
        },
      },
    }
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_reviewer, role')
    .eq('id', userId)
    .single();

  if (!profile) return false;

  return profile.is_reviewer === true || profile.role === 'admin';
}

