import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint to test callback routing
 * Access: http://localhost:3000/api/test-callback
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  
  const diagnostics = {
    timestamp: new Date().toISOString(),
    url: requestUrl.toString(),
    pathname: requestUrl.pathname,
    searchParams: Object.fromEntries(requestUrl.searchParams),
    headers: {
      host: request.headers.get('host'),
      referer: request.headers.get('referer'),
      userAgent: request.headers.get('user-agent'),
    },
    env: {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing',
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing',
    },
    callbackTest: {
      expectedCallbackUrl: `${requestUrl.protocol}//${requestUrl.host}/auth/callback`,
      testUrl: `${requestUrl.protocol}//${requestUrl.host}/auth/callback?code=test123&type=signup`,
    }
  };

  return NextResponse.json(diagnostics, { status: 200 });
}
