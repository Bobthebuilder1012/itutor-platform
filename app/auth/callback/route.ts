import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next');
  const type = requestUrl.searchParams.get('type'); // email confirmation type
  const error_code = requestUrl.searchParams.get('error_code');
  const error_description = requestUrl.searchParams.get('error_description');

  console.log('🔐 Auth callback - code:', !!code, 'type:', type, 'error_code:', error_code);
  console.log('📍 Full callback URL:', requestUrl.toString());

  // Handle OAuth errors
  if (error_code) {
    console.error('❌ OAuth error:', error_code, error_description);
    return NextResponse.redirect(new URL(`/login?error=${error_code}&message=${encodeURIComponent(error_description || 'Authentication failed')}`, request.url));
  }

  if (!code) {
    console.error('❌ No code parameter in callback');
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url));
  }

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
    console.error('❌ Error exchanging code for session:', sessionError);
    return NextResponse.redirect(new URL('/login?error=oauth_failed&message=' + encodeURIComponent(sessionError.message), request.url));
  }

  if (!session) {
    console.error('❌ No session returned after code exchange');
    return NextResponse.redirect(new URL('/login?error=no_session', request.url));
  }

  const userId = session.user.id;
  const userEmail = session.user.email;
  console.log('✅ Session established for user:', userId, 'email:', userEmail);

  // Detect if this is an email confirmation by checking if email was just confirmed
  const emailJustConfirmed = session.user.email_confirmed_at && 
    new Date(session.user.email_confirmed_at).getTime() > Date.now() - 60000; // Within last 60 seconds
  
  console.log('📧 Email confirmation status:', {
    confirmed_at: session.user.email_confirmed_at,
    justConfirmed: emailJustConfirmed,
    type: type
  });

  // For email confirmations, redirect to confirmation success page
  // This page tells users to go to the login page
  if (emailJustConfirmed || type === 'signup' || type === 'email') {
    console.log('✅ Email confirmation detected - redirecting to confirmation page');
    return NextResponse.redirect(new URL('/auth/confirmed', request.url));
  }

  // Check if profile exists
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, full_name, country, school, form_level, subjects_of_study, billing_mode, institution_id')
    .eq('id', userId)
    .single();

  console.log('👤 Profile fetch result - exists:', !!profile, 'role:', profile?.role);

  // If profile doesn't exist, create it (OAuth users)
  if (profileError && profileError.code === 'PGRST116') {
    console.log('📝 Creating new profile for OAuth user');
    // PGRST116 = no rows returned
    const newProfile = {
      id: userId,
      email: session.user.email!,
      full_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'User',
      avatar_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null,
      role: 'student', // Default role for OAuth
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from('profiles')
      .insert([newProfile]);

    if (insertError) {
      console.error('❌ Error creating profile:', insertError);
      return NextResponse.redirect(new URL('/login?error=profile_creation_failed', request.url));
    }

    console.log('✅ Profile created, redirecting to onboarding');
    // Redirect to onboarding for new OAuth users
    return NextResponse.redirect(new URL('/onboarding/student', request.url));
  }

  if (profileError) {
    console.error('❌ Error fetching profile:', profileError);
    return NextResponse.redirect(new URL('/login?error=profile_fetch_failed', request.url));
  }

  // Profile exists - determine where to redirect
  if (profile) {
    const role = profile.role;
    console.log('🔀 Determining redirect for role:', role);

    // If role is null, profile is incomplete - need to complete signup
    if (!role) {
      console.log('⚠️ No role set, checking user metadata');
      // Try to determine role from user metadata
      const metadataRole = session.user.user_metadata?.role;
      console.log('📋 User metadata role:', metadataRole);
      
      if (metadataRole === 'tutor') {
        console.log('➡️ Redirecting to tutor onboarding');
        return NextResponse.redirect(new URL('/onboarding/tutor', request.url));
      } else if (metadataRole === 'parent') {
        console.log('➡️ Redirecting to parent dashboard');
        return NextResponse.redirect(new URL('/parent/dashboard', request.url));
      } else {
        // Default to student onboarding
        console.log('➡️ Redirecting to student onboarding (default)');
        return NextResponse.redirect(new URL('/onboarding/student', request.url));
      }
    }

    // Check if profile is complete based on role
    if (role === 'student') {
      const hasBasicInfo = (profile.school || profile.institution_id) && profile.form_level;
      const hasSubjects = profile.subjects_of_study && profile.subjects_of_study.length > 0;

      if (!hasBasicInfo || !hasSubjects) {
        console.log('➡️ Student profile incomplete, redirecting to onboarding');
        return NextResponse.redirect(new URL('/onboarding/student', request.url));
      }

      console.log('➡️ Redirecting to student dashboard');
      return NextResponse.redirect(new URL('/student/dashboard', request.url));
    } else if (role === 'parent') {
      console.log('➡️ Redirecting to parent dashboard');
      return NextResponse.redirect(new URL('/parent/dashboard', request.url));
    } else if (role === 'tutor') {
      // Check if tutor has completed onboarding
      if (!profile.institution_id) {
        console.log('➡️ Tutor profile incomplete, redirecting to onboarding');
        return NextResponse.redirect(new URL('/onboarding/tutor', request.url));
      }
      console.log('➡️ Redirecting to tutor dashboard');
      return NextResponse.redirect(new URL('/tutor/dashboard', request.url));
    } else if (role === 'admin') {
      console.log('➡️ Redirecting to admin dashboard');
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }

    // If role exists but didn't match any case above, send to login with error
    console.log('⚠️ Unknown role:', role, '- redirecting to login');
    return NextResponse.redirect(new URL('/login?error=unknown_role', request.url));
  }

  // Profile doesn't exist (shouldn't happen since we create it or error above)
  console.log('⚠️ Profile null - redirecting to login');
  return NextResponse.redirect(new URL('/login?error=no_profile', request.url));
}

