import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { encrypt } from '@/lib/utils/encryption';
import { migrateSessionsToNewProvider } from '@/lib/services/migrateSessionsToNewProvider';
import { resolveGoogleRedirectUri } from '@/lib/auth/resolveGoogleRedirectUri';
import { getServerClient } from '@/lib/supabase/server';
import {
  DEFAULT_OAUTH_RETURN,
  clearOAuthNonceCookie,
  oauthNonceCookieName,
  safeReturnPath,
  verifyOAuthState,
} from '@/lib/auth/oauthState';
import type { VerifiedOAuthState } from '@/lib/auth/oauthState';

export const dynamic = 'force-dynamic';

const PROVIDER = 'google' as const;

/**
 * Every exit from this route goes through here, so every exit spends the
 * nonce: success or failure, the cookie is cleared and replaying the callback
 * URL finds nothing to match. `returnTo` is already a same-site path (it comes
 * from verifyOAuthState, or is the default); it goes through safeReturnPath
 * again so that stays true whatever a later edit passes in.
 */
function redirect(returnTo: string, baseUrl: string, params: Record<string, string>) {
  const url = new URL(safeReturnPath(returnTo), baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  clearOAuthNonceCookie(res, PROVIDER);
  return res;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const stateRaw = searchParams.get('state');
  const error = searchParams.get('error');

  // Whose tokens these are. This used to be read straight out of an unsigned
  // "userId|returnPath" state, so anyone could send a consent link carrying a
  // victim's id and have their own Google account become the victim's meeting
  // host. `state` must now carry our signature and match the nonce cookie this
  // browser was given at /connect. The legacy form is refused, which only
  // affects flows already in flight at deploy time.
  let verified: VerifiedOAuthState;
  try {
    verified = verifyOAuthState(
      stateRaw,
      request.cookies.get(oauthNonceCookieName(PROVIDER))?.value,
      PROVIDER,
    );
  } catch (err) {
    // Only throws when TOKEN_ENCRYPTION_KEY is missing, in which case nothing
    // can be verified or encrypted.
    console.error('Google OAuth state could not be verified:', err);
    return redirect(DEFAULT_OAUTH_RETURN, request.url, { error: 'server_config' });
  }
  const returnTo = verified.returnTo;

  if (!verified.ok) {
    console.warn('Google OAuth callback refused, state check failed:', verified.reason);
    return redirect(returnTo, request.url, { error: 'auth_failed' });
  }

  if (error || !code) {
    return redirect(returnTo, request.url, { error: 'auth_failed' });
  }

  // The nonce proves this browser started the flow. This proves the person
  // signed in on it now is the tutor it was started for, so a shared computer
  // where someone else signed in mid-flow can't attach their Google account to
  // the first tutor.
  let sessionUserId: string | null = null;
  try {
    const authClient = await getServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    sessionUserId = user?.id ?? null;
  } catch (err) {
    console.error('Google OAuth callback could not read the session:', err);
  }
  if (!sessionUserId || sessionUserId !== verified.userId) {
    console.warn('Google OAuth callback refused: signed-in user does not match state');
    return redirect(returnTo, request.url, { error: 'auth_failed' });
  }
  const tutorId = verified.userId;

  // Service role for the connection row, as before. Whose row it is has been
  // settled above.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const redirectUri = resolveGoogleRedirectUri(request);

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('❌ Missing Google OAuth credentials:', {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        hasRedirectUri: !!redirectUri,
      });
      return redirect(returnTo, request.url, { error: 'server_config' });
    }

    console.log('🔄 Exchanging OAuth code for tokens...', {
      hasCode: !!code,
      redirectUri,
      tutorId
    });

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('❌ Token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorData,
        redirectUri,
        clientIdPrefix: clientId.slice(0, 12) + '...',
      });
      return redirect(returnTo, request.url, { error: 'connection_failed', detail: `Token exchange ${tokenResponse.status}: ${errorData}` });
    }

    const tokens = await tokenResponse.json();

    // Get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to get user info');
    }

    const userInfo = await userInfoResponse.json();

    // Calculate token expiry
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

    // Check if tutor had a previous provider
    const { data: existingConnection } = await supabase
      .from('tutor_video_provider_connections')
      .select('provider')
      .eq('tutor_id', tutorId)
      .single();

    const previousProvider = existingConnection?.provider;
    const isSwitchingProvider = previousProvider && previousProvider !== 'google_meet';

    // Store connection in database
    const { error: dbError } = await supabase
      .from('tutor_video_provider_connections')
      .upsert({
        tutor_id: tutorId,
        provider: 'google_meet',
        is_active: true,
        connection_status: 'connected',
        provider_account_email: userInfo.email,
        provider_account_name: userInfo.name,
        access_token_encrypted: encrypt(tokens.access_token),
        refresh_token_encrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        token_expires_at: expiresAt.toISOString()
      }, {
        onConflict: 'tutor_id'
      });

    if (dbError) {
      console.error('❌ Database upsert error:', JSON.stringify(dbError, null, 2));
      return redirect(returnTo, request.url, { error: 'connection_failed', detail: dbError.message ?? dbError.code ?? 'unknown' });
    }

    // If switching from another provider, migrate all future sessions
    if (isSwitchingProvider) {
      console.log(`🔄 Tutor ${tutorId} is switching from ${previousProvider} to google_meet. Migrating sessions...`);
      
      const migrationResult = await migrateSessionsToNewProvider(tutorId, 'google_meet');
      
      if (migrationResult.success) {
        console.log(`✅ Successfully migrated ${migrationResult.migratedCount} sessions to Google Meet`);
        return redirect(returnTo, request.url, { success: 'true', migrated: String(migrationResult.migratedCount) });
      } else {
        console.warn(`⚠️ Session migration completed with issues: ${migrationResult.error}`);
        return redirect(returnTo, request.url, { success: 'true', migration_warning: 'true' });
      }
    }

    return redirect(returnTo, request.url, { success: 'true' });
  } catch (error: any) {
    console.error('❌ OAuth callback error:', error);
    return redirect(returnTo, request.url, { error: 'connection_failed', detail: error?.message ?? 'unknown' });
  }
}

