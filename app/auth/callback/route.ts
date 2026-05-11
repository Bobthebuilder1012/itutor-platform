import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { bootstrapProfileIfMissing } from '@/lib/server/bootstrapProfileIfMissing';
import { getServiceClient } from '@/lib/supabase/server';
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
    console.log('✅ Email confirmation detected - redirecting to role selection');
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
    console.log('📝 No profile found for user ID — checking by email first');

    // Check if there is already a profile with this email (existing email/password account)
    // Must use service client — the new OAuth user's session can't read another user's row
    if (userEmail) {
      const serviceClient = getServiceClient();
      const { data: existingProfileByEmail } = await serviceClient
        .from('profiles')
        .select('id, role, form_level, subjects_of_study, billing_mode')
        .eq('email', userEmail)
        .maybeSingle();

      if (existingProfileByEmail?.role) {
        console.log('✅ Found existing profile by email with role:', existingProfileByEmail.role, '— copying role to current session user');
        // Copy the role (and key fields) onto the NEW OAuth user's profile so their session works
        await bootstrapProfileIfMissing(session.user);
        await serviceClient
          .from('profiles')
          .update({
            role: existingProfileByEmail.role,
            form_level: existingProfileByEmail.form_level ?? null,
            subjects_of_study: existingProfileByEmail.subjects_of_study ?? null,
            billing_mode: existingProfileByEmail.billing_mode ?? null,
          })
          .eq('id', userId);

        const role = existingProfileByEmail.role as string;
        if (role === 'student') {
          return NextResponse.redirect(new URL(existingProfileByEmail.form_level ? '/student/dashboard' : '/signup/complete-role', request.url));
        }
        if (role === 'tutor') return NextResponse.redirect(new URL('/tutor/dashboard', request.url));
        if (role === 'parent') return NextResponse.redirect(new URL('/parent/dashboard', request.url));
        if (role === 'admin') return NextResponse.redirect(new URL(getAdminHomePath(userEmail!), request.url));
      }
    }

    const metadataRole = session.user.user_metadata?.role ?? null;
    const { error: bootstrapErr } = await bootstrapProfileIfMissing(session.user);
    if (bootstrapErr) {
      console.error('❌ Error creating profile:', bootstrapErr.message);
      return NextResponse.redirect(new URL('/login?error=profile_creation_failed', request.url));
    }

    if (!metadataRole && oauthProvider === 'google') {
      console.log('✅ New Google user — redirecting to role selection');
      return NextResponse.redirect(new URL('/signup/complete-role', request.url));
    }

    console.log('✅ Profile created, redirecting to role selection');
    return NextResponse.redirect(new URL('/signup/complete-role', request.url));
  }

  if (profileError) {
    console.error('❌ Error fetching profile:', profileError);
    return NextResponse.redirect(new URL('/login?error=profile_fetch_failed', request.url));
  }

  // Profile exists - determine where to redirect
  if (profile) {
    const role = profile.role;
    console.log('🔀 Determining redirect for role:', role);

    // If role is null, profile is incomplete
    if (!role) {
      // For Google users, check if there's another profile with the same email that has a role
      // (handles case where the same person has both email/password and Google accounts)
      if (oauthProvider === 'google' && userEmail) {
        const serviceClient = getServiceClient();
        const { data: emailProfile } = await serviceClient
          .from('profiles')
          .select('role, form_level, subjects_of_study, billing_mode')
          .eq('email', userEmail)
          .neq('id', userId)
          .maybeSingle();

        if (emailProfile?.role) {
          console.log('✅ Found role via email match on linked account:', emailProfile.role);
          await serviceClient.from('profiles').update({
            role: emailProfile.role,
            form_level: emailProfile.form_level ?? null,
            subjects_of_study: emailProfile.subjects_of_study ?? null,
            billing_mode: emailProfile.billing_mode ?? null,
          }).eq('id', userId);

          const r = emailProfile.role as string;
          if (r === 'student') {
            return NextResponse.redirect(new URL(emailProfile.form_level ? '/student/dashboard' : '/signup/complete-role', request.url));
          }
          if (r === 'tutor') return NextResponse.redirect(new URL('/tutor/dashboard', request.url));
          if (r === 'parent') return NextResponse.redirect(new URL('/parent/dashboard', request.url));
          if (r === 'admin') return NextResponse.redirect(new URL(getAdminHomePath(userEmail), request.url));
        }
        console.log('➡️ No linked account found — redirecting to role selection');
        return NextResponse.redirect(new URL('/signup/complete-role', request.url));
      }
      console.log('⚠️ No role set, checking user metadata');
      // Try to determine role from user metadata
      const metadataRole = session.user.user_metadata?.role;
      console.log('📋 User metadata role:', metadataRole);
      
      if (metadataRole === 'tutor') {
        console.log('➡️ Redirecting to tutor role completion');
        return NextResponse.redirect(new URL('/signup/complete-role', request.url));
      }
      if (metadataRole === 'parent') {
        console.log('➡️ Redirecting to parent dashboard');
        return NextResponse.redirect(new URL('/parent/dashboard', request.url));
      }
      if (metadataRole === 'student') {
        console.log('➡️ Redirecting to student role selection');
        return NextResponse.redirect(new URL('/signup/complete-role', request.url));
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
      if (!profile.form_level) {
        console.log('➡️ Student profile incomplete (no form_level), redirecting to complete-role');
        return NextResponse.redirect(new URL('/signup/complete-role', request.url));
      }

      console.log('➡️ Redirecting to student dashboard');
      return NextResponse.redirect(new URL('/student/dashboard', request.url));
    } else if (role === 'parent') {
      console.log('➡️ Redirecting to parent dashboard');
      return NextResponse.redirect(new URL('/parent/dashboard', request.url));
    } else if (role === 'tutor') {
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

