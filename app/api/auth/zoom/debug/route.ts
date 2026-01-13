import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * Debug endpoint to verify Zoom OAuth configuration
 * Access: /api/auth/zoom/debug
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
    hasClientId: !!process.env.ZOOM_CLIENT_ID,
    hasClientSecret: !!process.env.ZOOM_CLIENT_SECRET,
    hasRedirectUri: !!process.env.ZOOM_REDIRECT_URI,
    redirectUri: process.env.ZOOM_REDIRECT_URI || 'NOT SET',
    clientIdPrefix: process.env.ZOOM_CLIENT_ID?.substring(0, 20) + '...' || 'NOT SET',
    userId: user.id
  };

  return NextResponse.json({
    status: 'Zoom OAuth Configuration Check',
    timestamp: new Date().toISOString(),
    config,
    instructions: {
      redirectUri: 'This MUST exactly match an authorized redirect URI in Zoom Marketplace',
      zoomMarketplace: 'https://marketplace.zoom.us/develop/apps',
      commonIssues: [
        'Redirect URI has trailing slash',
        'Using http instead of https (or vice versa)',
        'Domain mismatch (www vs non-www)',
        'Missing environment variables'
      ]
    }
  });
}


