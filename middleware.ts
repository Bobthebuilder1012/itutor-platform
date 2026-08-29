import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  ATTR_COOKIE,
  LAST_COOKIE,
  ANON_COOKIE,
  ATTR_MAX_AGE,
  ANON_MAX_AGE,
  readAttributionFromUrl,
  serializeAttribution,
} from '@/lib/analytics/attribution';

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

/**
 * Routes whose primary audience has no account.
 *
 * These skip the pending-feedback gate — which fires a server-side fetch on
 * every non-API page request and can only ever redirect an AUTHENTICATED user
 * who owes a rating, so on these routes it is a guaranteed-useless round trip in
 * front of the product's new front door.
 *
 * NOT added to isFeedbackExemptPath, even though the name fits: that predicate
 * feeds the early return at the top of middleware(), which returns WITHOUT
 * applying cookies. Exempting /find there would mean itutor_anon is never minted
 * on the wizard — and that cookie is both the attribution key and the abuse
 * guard on /api/finder/submit, which refuses a request without it. So the skip
 * happens further down, next to the /r/[code] one, where cookies are applied
 * first.
 *
 * Prefix-matched on `/find/` so it covers /find/results and /find/browse.
 */
function isAnonymousFirstPath(pathname: string) {
  return pathname === '/start' || pathname === '/find' || pathname.startsWith('/find/');
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

/**
 * /r/[code] is a pure attribution redirect. The pending-feedback gate is
 * skipped here so the campaign hop stays a single fast redirect; the gate
 * still fires on the destination page, so nothing is bypassed.
 */
function isAttributionRedirectPath(pathname: string) {
  return pathname === '/r' || pathname.startsWith('/r/');
}

// ---------------------------------------------------------------------------
// Attribution (Find Your iTutor Build Plan §2.2)
//
// Cookies must be set before render so a server component on /find can read
// them. This is deliberately not done client-side: a client-side write loses
// the first hit on slow connections, which is exactly the traffic paid
// campaigns buy.
// ---------------------------------------------------------------------------

interface PendingCookie {
  name: string;
  value: string;
  maxAge: number;
}

function collectAttributionCookies(request: NextRequest): PendingCookie[] {
  const pending: PendingCookie[] = [];
  const attribution = readAttributionFromUrl(request.nextUrl);

  if (attribution) {
    const serialized = serializeAttribution(attribution);

    // First touch only — never overwrite an existing itutor_attr.
    if (!request.cookies.get(ATTR_COOKIE)) {
      pending.push({ name: ATTR_COOKIE, value: serialized, maxAge: ATTR_MAX_AGE });
    }

    // Last touch is rewritten on every attributed visit.
    pending.push({ name: LAST_COOKIE, value: serialized, maxAge: ATTR_MAX_AGE });
  }

  // Always ensure an anon id exists, attributed visit or not — it is what ties
  // pre-signup landing events to the account that eventually registers.
  if (!request.cookies.get(ANON_COOKIE)) {
    pending.push({ name: ANON_COOKIE, value: crypto.randomUUID(), maxAge: ANON_MAX_AGE });
  }

  return pending;
}

/**
 * Applied to every response this middleware can return, including redirects.
 * A cookie set only on the NextResponse.next() path would be dropped on
 * exactly the redirect flows campaign traffic goes through.
 */
function applyCookies(response: NextResponse, pending: PendingCookie[]) {
  for (const cookie of pending) {
    response.cookies.set({
      name: cookie.name,
      value: cookie.value,
      maxAge: cookie.maxAge,
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicAssetPath(pathname) || isFeedbackExemptPath(pathname) || isApiPath(pathname)) {
    return NextResponse.next();
  }

  const attributionCookies = collectAttributionCookies(request);

  // Block unauthenticated access to admin/reviewer routes at the server level
  if (isProtectedPath(pathname)) {
    const response = applyCookies(NextResponse.next(), attributionCookies);

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
      return applyCookies(NextResponse.redirect(loginUrl), attributionCookies);
    }
  }

  if (isAttributionRedirectPath(pathname) || isAnonymousFirstPath(pathname)) {
    return applyCookies(NextResponse.next(), attributionCookies);
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
      return applyCookies(NextResponse.next(), attributionCookies);
    }

    const data = (await res.json().catch(() => ({}))) as { redirectTo?: string | null };
    const redirectTo = data?.redirectTo;

    if (redirectTo && pathname !== redirectTo) {
      return applyCookies(
        NextResponse.redirect(new URL(redirectTo, request.url)),
        attributionCookies
      );
    }
  } catch {
    // If the check fails, do not block navigation.
  }

  return applyCookies(NextResponse.next(), attributionCookies);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
