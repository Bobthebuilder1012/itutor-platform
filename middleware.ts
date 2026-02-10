import { NextRequest, NextResponse } from 'next/server';

function isPublicAssetPath(pathname: string) {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  );
}

function isFeedbackExemptPath(pathname: string) {
  return (
    pathname.startsWith('/feedback/') ||
    pathname.startsWith('/api/feedback/')
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicAssetPath(pathname) || isFeedbackExemptPath(pathname)) {
    return NextResponse.next();
  }

  // Middleware runs on Edge; avoid Supabase client here. Delegate to a server API.
  try {
    const pendingUrl = new URL('/api/feedback/pending', request.url);
    const res = await fetch(pendingUrl, {
      headers: {
        cookie: request.headers.get('cookie') || '',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.next();
    }

    const data = (await res.json().catch(() => ({}))) as { redirectTo?: string | null };
    const redirectTo = data?.redirectTo;

    if (redirectTo && pathname !== redirectTo) {
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }
  } catch {
    // If the check fails, do not block navigation.
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};

