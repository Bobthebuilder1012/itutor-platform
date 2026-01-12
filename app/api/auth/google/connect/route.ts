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

  // Validate required environment variables
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    console.error('❌ Missing Google OAuth environment variables:', {
      hasClientId: !!clientId,
      hasRedirectUri: !!redirectUri
    });
    return NextResponse.json({ 
      error: 'Server configuration error. Please contact support.' 
    }, { status: 500 });
  }

  // Log configuration for debugging (remove client_id for security)
  console.log('🔍 Google OAuth Configuration:', {
    redirectUri,
    userId: user.id,
    timestamp: new Date().toISOString()
  });

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
  
  return NextResponse.redirect(authUrl);
}

