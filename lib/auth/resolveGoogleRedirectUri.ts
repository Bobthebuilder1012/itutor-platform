/**
 * Derive the Google OAuth redirect URI from the incoming request so that
 * preview deploys (whose host changes per branch / per deploy) work without
 * editing env vars. The same value MUST be sent on the /connect request and
 * on the /callback token exchange, so both routes call this helper.
 *
 * Whatever URL this returns must also be added to the OAuth Client's
 * "Authorized redirect URIs" list in Google Cloud Console.
 */
export function resolveGoogleRedirectUri(request: Request): string {
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const isLocal =
    !!host && (host.startsWith('localhost') || host.startsWith('127.'));
  const proto =
    request.headers.get('x-forwarded-proto') ?? (isLocal ? 'http' : 'https');

  // On Vercel previews the host changes per branch/deploy, so always derive
  // from the request rather than the (necessarily static) env var.
  if (process.env.VERCEL_ENV === 'preview' && host) {
    return `${proto}://${host}/api/auth/google/callback`;
  }

  const override = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (override) return override;

  return host ? `${proto}://${host}/api/auth/google/callback` : '';
}
