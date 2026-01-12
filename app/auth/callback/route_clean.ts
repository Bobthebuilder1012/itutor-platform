import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/';
  const type = requestUrl.searchParams.get('type'); // email confirmation type

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.delete({ name, ...options });
          },
        },
      }
    );

    // Exchange code for session
    const { data: { session }, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError) {
      console.error('Error exchanging code for session:', sessionError);
      return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url));
    }

    if (!session) {
      return NextResponse.redirect(new URL('/login?error=no_session', request.url));
    }

    const userId = session.user.id;

    // Check if profile exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, full_name, country, school, form_level, subjects_of_study, billing_mode, institution_id')
      .eq('id', userId)
      .single();

    // If profile doesn't exist, create it
    if (profileError && profileError.code === 'PGRST116') {
      // PGRST116 = no rows returned
      const newProfile = {
        id: userId,
        email: session.user.email!,
        full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'User',
        avatar_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null,
        role: 'student', // Default role
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from('profiles')
        .insert([newProfile]);

      if (insertError) {
        console.error('Error creating profile:', insertError);
        return NextResponse.redirect(new URL('/login?error=profile_creation_failed', request.url));
      }

      // Redirect to onboarding for new OAuth users
      return NextResponse.redirect(new URL('/onboarding/student', request.url));
    }

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return NextResponse.redirect(new URL('/login?error=profile_fetch_failed', request.url));
    }

    // Profile exists - determine where to redirect
    if (profile) {
      const role = profile.role;

      // Check if profile is complete
      if (role === 'student') {
        // For students, check both old 'school' field and new 'institution_id'
        const hasBasicInfo = (profile.school || profile.institution_id) && profile.form_level;
        const hasSubjects = profile.subjects_of_study && profile.subjects_of_study.length > 0;

        if (!hasBasicInfo || !hasSubjects) {
          return NextResponse.redirect(new URL('/onboarding/student', request.url));
        }

        return NextResponse.redirect(new URL('/student/dashboard', request.url));
      } else if (role === 'parent') {
        return NextResponse.redirect(new URL('/parent/dashboard', request.url));
      } else if (role === 'tutor') {
        return NextResponse.redirect(new URL('/tutor/dashboard', request.url));
      } else if (role === 'admin') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
    }
  }

  // Default redirect if something went wrong
  return NextResponse.redirect(new URL(next, request.url));
}

