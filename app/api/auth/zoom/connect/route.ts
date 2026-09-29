import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createOAuthState, setOAuthNonceCookie } from '@/lib/auth/oauthState';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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

  if (profile?.role !== 'tutor') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Validate required environment variables (trim to remove any whitespace/newlines)
  const clientId = process.env.ZOOM_CLIENT_ID?.trim();
  const redirectUri = process.env.ZOOM_REDIRECT_URI?.trim();

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/96e0dc54-0d29-41a7-8439-97ee7ad5934e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/auth/zoom/connect/route.ts:45',message:'Raw ENV check',data:{rawClientId:process.env.ZOOM_CLIENT_ID,rawRedirectUri:process.env.ZOOM_REDIRECT_URI,clientIdLength:clientId?.length,redirectUriLength:redirectUri?.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  if (!clientId || !redirectUri) {
    console.error('❌ Missing Zoom OAuth environment variables:', {
      hasClientId: !!clientId,
      hasRedirectUri: !!redirectUri
    });
    return NextResponse.json({ 
      error: 'Server configuration error. Please contact support.',
      details: 'Missing Zoom OAuth credentials',
      missing: {
        clientId: !clientId,
        redirectUri: !redirectUri
      },
      debug: true
    }, { status: 500 });
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/96e0dc54-0d29-41a7-8439-97ee7ad5934e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/auth/zoom/connect/route.ts:65',message:'ENV vars loaded',data:{clientId,redirectUri,userId:user.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,C,E'})}).catch(()=>{});
  // #endregion

  // Signed state bound to a nonce cookie on this browser, not the old plain
  // "userId|returnPath" the callback trusted outright. See the Google connect
  // route and lib/auth/oauthState.ts for why.
  const from = new URL(request.url).searchParams.get('from');
  let state: string;
  let nonce: string;
  try {
    ({ state, nonce } = createOAuthState(user.id, from, 'zoom'));
  } catch (err) {
    // Only throws when TOKEN_ENCRYPTION_KEY is missing, which the callback
    // needs to encrypt the tokens too. Stop before the consent screen.
    console.error('Could not sign Zoom OAuth state:', err);
    return NextResponse.json({
      error: 'Server configuration error. Please contact support.',
      details: 'OAuth state could not be signed',
    }, { status: 500 });
  }

  // Build OAuth URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });

  const authUrl = `https://zoom.us/oauth/authorize?${params.toString()}`;
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/96e0dc54-0d29-41a7-8439-97ee7ad5934e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/auth/zoom/connect/route.ts:72',message:'OAuth URL constructed',data:{authUrl,paramsString:params.toString()},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,C,D'})}).catch(()=>{});
  // #endregion

  const res = NextResponse.redirect(authUrl);
  setOAuthNonceCookie(res, 'zoom', nonce);
  return res;
}
