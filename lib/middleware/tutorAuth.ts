// =====================================================
// TUTOR AUTHENTICATION MIDDLEWARE
// =====================================================
// Checks if user is an authenticated tutor
// Tutor role: profiles.role = 'tutor' AND profiles.id = auth.uid()

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function requireTutor() {
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

  // Check if user is a tutor
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, full_name, email, tutor_verification_status')
    .eq('id', session.user.id)
    .single();

  if (profileError || !profile) {
    return {
      error: NextResponse.json({ error: 'Profile not found' }, { status: 404 }),
      user: session.user,
      profile: null,
    };
  }

  // Check tutor role
  if (profile.role !== 'tutor') {
    return {
      error: NextResponse.json({ error: 'Forbidden: Tutor access required' }, { status: 403 }),
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

export async function isTutor(userId: string): Promise<boolean> {
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
    .select('role')
    .eq('id', userId)
    .single();

  return profile?.role === 'tutor';
}

