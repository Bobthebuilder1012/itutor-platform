import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

  // Build OAuth URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: user.id // Pass user ID to callback
  });

  const authUrl = `https://zoom.us/oauth/authorize?${params.toString()}`;
  
  return NextResponse.redirect(authUrl);
}
