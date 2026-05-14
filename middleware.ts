import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PROTECTED_ADMIN_PATHS = ['/admin'];
const PROTECTED_REVIEWER_PATHS = ['/reviewer'];

function isPublicAssetPath(pathname: string) {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/manifest.json'
  );
}

function isFeedbackExemptPath(pathname: string) {
  return (
    pathname.startsWith('/feedback/') ||
    pathname.startsWith('/api/feedback/')
  );
}

function isApiPath(pathname: string) {
  return pathname.startsWith('/api/');
}

function isProtectedPath(pathname: string) {
  return (
    PROTECTED_ADMIN_PATHS.some(p => pathname.startsWith(p)) ||
    PROTECTED_REVIEWER_PATHS.some(p => pathname.startsWith(p))
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicAssetPath(pathname) || isFeedbackExemptPath(pathname) || isApiPath(pathname)) {
    return NextResponse.next();
  }

  // Block unauthenticated access to admin/reviewer routes at the server level
  if (isProtectedPath(pathname)) {
    const response = NextResponse.next();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return request.cookies.get(name)?.value;
          },
          set(name, value, options) {
            response.cookies.set({ name, value, ...options });
          },
          remove(name, options) {
            response.cookies.set({ name, value: '', ...options });
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Feedback redirect check for authenticated pages
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

