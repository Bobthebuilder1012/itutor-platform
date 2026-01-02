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
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  // Check if user is authenticated
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
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
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile) {
    return {
      error: NextResponse.json({ error: 'Profile not found' }, { status: 404 }),
      user: session.user,
      profile: null,
    };
  }

  // Check admin privileges: is_reviewer = true OR role = 'admin'
  if (!profile.is_reviewer && profile.role !== 'admin') {
    return {
      error: NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 }),
      user: session.user,
      profile,
    };
  }

  return {
    error: null,
    user: session.user,
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
        get(name: string) {
          return cookieStore.get(name)?.value;
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

