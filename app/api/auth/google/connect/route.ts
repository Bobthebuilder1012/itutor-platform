import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/auth/google/connect/route.ts:7',message:'Google connect route called',data:{url:request.url,method:request.method},timestamp:Date.now(),sessionId:'debug-session',runId:'google-oauth-debug',hypothesisId:'A,C,D'})}).catch(()=>{});
  // #endregion

  const cookieStore = cookies();
  
  // Create Supabase client with SSR support
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
  
  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/auth/google/connect/route.ts:26',message:'User authentication check',data:{hasUser:!!user,hasError:!!authError,userId:user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'google-oauth-debug',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  
  if (authError || !user) {
    const url = new URL('/login?error=not_authenticated', request.url);
    return NextResponse.redirect(url);
  }

  // Verify user is a tutor
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/auth/google/connect/route.ts:39',message:'Profile role check',data:{hasProfile:!!profile,role:profile?.role,isTutor:profile?.role==='tutor'},timestamp:Date.now(),sessionId:'debug-session',runId:'google-oauth-debug',hypothesisId:'D'})}).catch(()=>{});
  // #endregion

  if (profile?.role !== 'tutor') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Validate required environment variables
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/auth/google/connect/route.ts:52',message:'Environment variables loaded',data:{hasClientId:!!clientId,hasRedirectUri:!!redirectUri,clientIdType:typeof clientId,redirectUriType:typeof redirectUri,clientIdLength:clientId?.length||0,redirectUriLength:redirectUri?.length||0,clientIdPrefix:clientId?.substring(0,20)||'MISSING',redirectUriValue:redirectUri||'MISSING'},timestamp:Date.now(),sessionId:'debug-session',runId:'google-oauth-debug',hypothesisId:'A,B,C,E'})}).catch(()=>{});
  // #endregion

  if (!clientId || !redirectUri) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/auth/google/connect/route.ts:56',message:'Missing environment variables - returning error',data:{missingClientId:!clientId,missingRedirectUri:!redirectUri},timestamp:Date.now(),sessionId:'debug-session',runId:'google-oauth-debug',hypothesisId:'A,B'})}).catch(()=>{});
    // #endregion
    console.error('❌ Missing Google OAuth environment variables:', {
      hasClientId: !!clientId,
      hasRedirectUri: !!redirectUri
    });
    return NextResponse.json({ 
      error: 'Server configuration error. Please contact support.',
      details: 'Missing Google OAuth credentials',
      missing: {
        clientId: !clientId,
        redirectUri: !redirectUri
      },
      debug: true
    }, { status: 500 });
  }

  // Log configuration for debugging (remove client_id for security)
  console.log('🔍 Google OAuth Configuration:', {
    redirectUri,
    userId: user.id,
    timestamp: new Date().toISOString()
  });

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/auth/google/connect/route.ts:78',message:'Building OAuth URL - all checks passed',data:{redirectUri,userId:user.id,hasClientId:!!clientId},timestamp:Date.now(),sessionId:'debug-session',runId:'google-oauth-debug',hypothesisId:'C,E'})}).catch(()=>{});
  // #endregion

  // Build OAuth URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state: user.id // Pass user ID to callback
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  
  console.log('✅ Redirecting to Google OAuth:', authUrl.substring(0, 100) + '...');

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/auth/google/connect/route.ts:95',message:'Redirecting to Google',data:{authUrlPrefix:authUrl.substring(0,150)},timestamp:Date.now(),sessionId:'debug-session',runId:'google-oauth-debug',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  
  return NextResponse.redirect(authUrl);
}

