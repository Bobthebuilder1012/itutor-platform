import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { resolveGoogleRedirectUri } from '@/lib/auth/resolveGoogleRedirectUri';
import { connectOnCallbackHost, createOAuthState, setOAuthNonceCookie } from '@/lib/auth/oauthState';

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

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const redirectUri = resolveGoogleRedirectUri(request);

  if (!clientId || !redirectUri) {
    console.error('❌ Missing Google OAuth configuration:', {
      hasClientId: !!clientId,
      hasRedirectUri: !!redirectUri,
    });
    return NextResponse.json({
      error: 'Server configuration error. Please contact support.',
      details: 'Missing Google OAuth credentials',
      missing: { clientId: !clientId, redirectUri: !redirectUri },
      debug: true,
    }, { status: 500 });
  }

  // The callback must see this browser's nonce and session cookies, which are
  // host-only. If Google will return the tutor to another host, start again
  // there. See connectOnCallbackHost.
  const onCallbackHost = connectOnCallbackHost(request, redirectUri);
  if (onCallbackHost) return NextResponse.redirect(onCallbackHost);

  // `state` used to be the plain "userId|returnPath", and the callback stored
  // Google's tokens against whatever id it found there, so anyone could make
  // their own Google account a stranger's meeting host. It is now signed and
  // bound to a nonce cookie on this browser (lib/auth/oauthState.ts), and the
  // callback also requires the signed-in user to be the one named in it.
  // `from` is cut down to a same-site path, so the callback can't be used to
  // bounce a tutor to another site.
  const from = new URL(request.url).searchParams.get('from');
  let state: string;
  let nonce: string;
  try {
    ({ state, nonce } = createOAuthState(user.id, from, 'google'));
  } catch (err) {
    // Only throws when TOKEN_ENCRYPTION_KEY is missing. The callback couldn't
    // encrypt the tokens without it either, so stop before the consent screen
    // rather than after the tutor has granted access.
    console.error('Could not sign Google OAuth state:', err);
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
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  const res = NextResponse.redirect(authUrl);
  setOAuthNonceCookie(res, 'google', nonce);
  return res;
}

