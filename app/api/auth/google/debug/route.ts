import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * Debug endpoint to verify Google OAuth configuration
 * Access: /api/auth/google/debug
 * Only available to authenticated tutors
 */
export async function GET(request: Request) {
  const cookieStore = cookies();
  
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
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Verify user is a tutor
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'tutor') {
    return NextResponse.json({ error: 'Unauthorized - tutors only' }, { status: 403 });
  }

  // Check configuration
  const config = {
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasRedirectUri: !!process.env.GOOGLE_REDIRECT_URI,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'NOT SET',
    clientIdPrefix: process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...' || 'NOT SET',
    expectedScopes: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    userId: user.id
  };

  return NextResponse.json({
    status: 'Google OAuth Configuration Check',
    timestamp: new Date().toISOString(),
    config,
    instructions: {
      redirectUri: 'This MUST exactly match an authorized redirect URI in Google Cloud Console',
      googleConsole: 'https://console.cloud.google.com/apis/credentials',
      commonIssues: [
        'Redirect URI has trailing slash',
        'Using http instead of https (or vice versa)',
        'Domain mismatch (www vs non-www)',
        'Missing environment variables'
      ]
    }
  });
}

