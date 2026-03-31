import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { bootstrapProfileIfMissing } from '@/lib/server/bootstrapProfileIfMissing';
import {
  getAdminHomePath,
  isEmailManagementOnlyAdmin,
} from '@/lib/auth/adminAccess';

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
  const oauthProvider = session.user.app_metadata?.provider as string | undefined;
  console.log('✅ Session established for user:', userId, 'email:', userEmail);

  // Only treat explicit email verification callbacks as email-confirmation flows.
  const isEmailConfirmationFlow = type === 'signup' || type === 'email';
  if (isEmailConfirmationFlow) {
    console.log('✅ Email confirmation detected - redirecting to onboarding');
    const userRole = session.user.user_metadata?.role as string | undefined;

    if (userRole === 'tutor') {
      return NextResponse.redirect(new URL('/onboarding/tutor', request.url));
    }
    if (userRole === 'parent') {
      return NextResponse.redirect(new URL('/parent/dashboard', request.url));
    }
    if (userRole === 'student') {
      return NextResponse.redirect(new URL('/onboarding/student', request.url));
    }
    return NextResponse.redirect(new URL('/signup/complete-role', request.url));
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
    const metadataRole = session.user.user_metadata?.role ?? null;
    const { error: bootstrapErr } = await bootstrapProfileIfMissing(session.user);
    if (bootstrapErr) {
      console.error('❌ Error creating profile:', bootstrapErr.message);
      return NextResponse.redirect(new URL('/login?error=profile_creation_failed', request.url));
    }

    if (!metadataRole && oauthProvider === 'google') {
      console.log('✅ Profile created, redirecting to Google role selection');
      return NextResponse.redirect(new URL('/?auth=complete-role&source=google', request.url));
    }

    console.log('✅ Profile created, redirecting to onboarding');
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
      if (oauthProvider === 'google') {
        console.log('➡️ Redirecting to Google role selection');
        return NextResponse.redirect(new URL('/?auth=complete-role&source=google', request.url));
      }
      console.log('⚠️ No role set, checking user metadata');
      // Try to determine role from user metadata
      const metadataRole = session.user.user_metadata?.role;
      console.log('📋 User metadata role:', metadataRole);
      
      if (metadataRole === 'tutor') {
        console.log('➡️ Redirecting to tutor onboarding');
        return NextResponse.redirect(new URL('/onboarding/tutor', request.url));
      }
      if (metadataRole === 'parent') {
        console.log('➡️ Redirecting to parent dashboard');
        return NextResponse.redirect(new URL('/parent/dashboard', request.url));
      }
      if (metadataRole === 'student') {
        console.log('➡️ Redirecting to student onboarding');
        return NextResponse.redirect(new URL('/onboarding/student', request.url));
      }
      console.log('➡️ Redirecting to role selection');
      return NextResponse.redirect(new URL('/signup/complete-role', request.url));
    }

    if (isEmailManagementOnlyAdmin(userEmail)) {
      console.log('➡️ Redirecting email-only account to admin emails');
      return NextResponse.redirect(new URL('/admin/emails', request.url));
    }

    // Check if profile is complete based on role
    if (role === 'student') {
      const hasBasicInfo = Boolean(profile.form_level);
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
      const { count: tutorSubjectCount, error: tutorSubjectsError } = await supabase
        .from('tutor_subjects')
        .select('id', { count: 'exact', head: true })
        .eq('tutor_id', userId);

      if (tutorSubjectsError || !tutorSubjectCount) {
        console.log('➡️ Tutor profile incomplete (no subjects), redirecting to onboarding');
        return NextResponse.redirect(new URL('/onboarding/tutor', request.url));
      }
      console.log('➡️ Redirecting to tutor dashboard');
      return NextResponse.redirect(new URL('/tutor/dashboard', request.url));
    } else if (role === 'admin') {
      const adminPath = getAdminHomePath(userEmail);
      console.log('➡️ Redirecting to admin area:', adminPath);
      return NextResponse.redirect(new URL(adminPath, request.url));
    }

    // If role exists but didn't match any case above, send to login with error
    console.log('⚠️ Unknown role:', role, '- redirecting to login');
    return NextResponse.redirect(new URL('/login?error=unknown_role', request.url));
  }

  // Profile doesn't exist (shouldn't happen since we create it or error above)
  console.log('⚠️ Profile null - redirecting to login');
  return NextResponse.redirect(new URL('/login?error=no_profile', request.url));
}

