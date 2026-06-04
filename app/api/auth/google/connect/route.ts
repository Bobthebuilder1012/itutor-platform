import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { resolveGoogleRedirectUri } from '@/lib/auth/resolveGoogleRedirectUri';

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

  const from = new URL(request.url).searchParams.get('from') || '';
  // State = "userId|returnPath" — pipe is safe since UUIDs don't contain it
  const state = from ? `${user.id}|${from}` : user.id;

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
  
  return NextResponse.redirect(authUrl);
}

