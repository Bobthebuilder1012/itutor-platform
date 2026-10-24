import { Browser } from '@capacitor/browser';
import { supabase } from '@/lib/supabase/client';
import { NATIVE_OAUTH_REDIRECT, isNativeApp } from '@/lib/native/platform';

export type NativeOAuthProvider = 'google' | 'apple';

/**
 * Starts OAuth from inside the native shell.
 *
 * Google refuses to serve its sign-in pages to an embedded WebView
 * (`disallowed_useragent`), so the authorize URL is handed to the system
 * browser — a Custom Tab on Android, SFSafariViewController on iOS. Supabase
 * then redirects to com.myitutor.app://auth/callback, which the OS routes back
 * to the app, where NativeAppBridge finishes the job.
 */
export async function startNativeOAuth(
  provider: NativeOAuthProvider,
  redirectTo?: string
): Promise<void> {
  // Carry the caller's destination on the deep link so it survives the trip
  // through the system browser. Only same-origin paths, never a full URL.
  const returnUrl =
    redirectTo && redirectTo.startsWith('/')
      ? `${NATIVE_OAUTH_REDIRECT}?redirect=${encodeURIComponent(redirectTo)}`
      : NATIVE_OAUTH_REDIRECT;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: returnUrl,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error('No authorization URL returned');

  await Browser.open({ url: data.url, presentationStyle: 'popover' });
}

/**
 * Turns a com.myitutor.app://auth/callback deep link into the path the WebView
 * should load next, and dismisses the system browser.
 *
 * The PKCE code is deliberately NOT exchanged here. It is handed to the
 * existing /auth/callback route handler, which is where profile bootstrap,
 * finder-run adoption and the role-based redirect live — the native app takes
 * exactly the same path through sign-in as the website. That route reads the
 * code verifier from the cookie this WebView already set, so the exchange
 * succeeds server-side.
 *
 * Returns null when the link is not an auth callback.
 */
export async function resolveNativeAuthCallback(callbackUrl: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    return null;
  }

  await closeAuthBrowser();

  const params = parsed.searchParams;

  // Supabase reports a refusal (cancelled, provider misconfigured) as query
  // params. /auth/callback renders these on the login page already.
  if (params.get('error') || params.get('error_description')) {
    const query = new URLSearchParams({
      error: params.get('error') || 'oauth_failed',
      message: params.get('error_description') || 'Authentication failed',
    });
    return `/login?${query.toString()}`;
  }

  const code = params.get('code');
  if (code) {
    const query = new URLSearchParams({ code });
    // Preserve where the visitor was headed before signing in.
    const redirect = params.get('redirect') || params.get('next');
    if (redirect) query.set('redirect', redirect);
    return `/auth/callback?${query.toString()}`;
  }

  // Implicit-flow fallback: tokens arrive in the fragment and there is no
  // server route for them, so set the session here. @supabase/ssr writes it to
  // cookies, so the server sees it on the next navigation.
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const access_token = hash.get('access_token');
  const refresh_token = hash.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return '/';
  }

  return null;
}

/** Dismiss the system browser. Harmless if it is already gone. */
async function closeAuthBrowser(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await Browser.close();
  } catch {
    // iOS throws when the sheet has already been dismissed by the user.
  }
}
