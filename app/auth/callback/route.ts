import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/';
  const type = requestUrl.searchParams.get('type'); // email confirmation type

  // #region agent log
  await fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/auth/callback/route.ts:8',message:'Callback route accessed',data:{hasCode:!!code,codeLength:code?.length,type:type,next:next,fullUrl:request.url},timestamp:Date.now(),sessionId:'debug-session',runId:'email-confirm-test',hypothesisId:'H2,H3,H4'})}).catch(()=>{});
  // #endregion

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

    // #region agent log
    await fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/auth/callback/route.ts:34',message:'After code exchange',data:{hasSession:!!session,hasError:!!sessionError,errorMessage:sessionError?.message,errorStatus:sessionError?.status,userId:session?.user?.id,userEmail:session?.user?.email},timestamp:Date.now(),sessionId:'debug-session',runId:'email-confirm-test',hypothesisId:'H2,H4'})}).catch(()=>{});
    // #endregion

    if (sessionError) {
      console.error('Error exchanging code for session:', sessionError);
      // #region agent log
      await fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/auth/callback/route.ts:38',message:'Session error - redirecting to login',data:{errorMessage:sessionError.message,redirectUrl:'/login?error=oauth_failed'},timestamp:Date.now(),sessionId:'debug-session',runId:'email-confirm-test',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url));
    }

    if (!session) {
      // #region agent log
      await fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/auth/callback/route.ts:42',message:'No session - redirecting to login',data:{redirectUrl:'/login?error=no_session'},timestamp:Date.now(),sessionId:'debug-session',runId:'email-confirm-test',hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      return NextResponse.redirect(new URL('/login?error=no_session', request.url));
    }

    const userId = session.user.id;

    // #region agent log
    await fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/auth/callback/route.ts:45',message:'Fetching user profile',data:{userId:userId,userEmail:session.user.email},timestamp:Date.now(),sessionId:'debug-session',runId:'email-confirm-test',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

    // Check if profile exists
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, full_name, country, school, form_level, subjects_of_study, billing_mode, institution_id')
      .eq('id', userId)
      .single();

    // #region agent log
    await fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/auth/callback/route.ts:53',message:'Profile fetch result',data:{hasProfile:!!profile,profileRole:profile?.role,hasError:!!profileError,errorCode:profileError?.code,errorMessage:profileError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'email-confirm-test',hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

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
          // #region agent log
          await fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/auth/callback/route.ts:117',message:'Redirecting to onboarding - incomplete profile',data:{role:role,hasBasicInfo:hasBasicInfo,hasSubjects:hasSubjects,redirectTo:'/onboarding/student'},timestamp:Date.now(),sessionId:'debug-session',runId:'email-confirm-test',hypothesisId:'H4'})}).catch(()=>{});
          // #endregion
          return NextResponse.redirect(new URL('/onboarding/student', request.url));
        }

        // #region agent log
        await fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/auth/callback/route.ts:120',message:'Redirecting to dashboard - complete profile',data:{role:role,redirectTo:'/student/dashboard'},timestamp:Date.now(),sessionId:'debug-session',runId:'email-confirm-test',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        return NextResponse.redirect(new URL('/student/dashboard', request.url));
      } else if (role === 'parent') {
        // #region agent log
        await fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/auth/callback/route.ts:122',message:'Redirecting parent to dashboard',data:{role:role,redirectTo:'/parent/dashboard'},timestamp:Date.now(),sessionId:'debug-session',runId:'email-confirm-test',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        return NextResponse.redirect(new URL('/parent/dashboard', request.url));
      } else if (role === 'tutor') {
        // #region agent log
        await fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/auth/callback/route.ts:124',message:'Redirecting tutor to dashboard',data:{role:role,redirectTo:'/tutor/dashboard'},timestamp:Date.now(),sessionId:'debug-session',runId:'email-confirm-test',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        return NextResponse.redirect(new URL('/tutor/dashboard', request.url));
      } else if (role === 'admin') {
        // #region agent log
        await fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/auth/callback/route.ts:126',message:'Redirecting admin to dashboard',data:{role:role,redirectTo:'/admin/dashboard'},timestamp:Date.now(),sessionId:'debug-session',runId:'email-confirm-test',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
    }
  }

  // Default redirect if something went wrong
  // #region agent log
  await fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/auth/callback/route.ts:130',message:'Default fallback redirect',data:{next:next,noCodeProvided:!code},timestamp:Date.now(),sessionId:'debug-session',runId:'email-confirm-test',hypothesisId:'H2,H3'})}).catch(()=>{});
  // #endregion
  return NextResponse.redirect(new URL(next, request.url));
}

