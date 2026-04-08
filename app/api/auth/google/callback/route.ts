import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { encrypt } from '@/lib/utils/encryption';
import { migrateSessionsToNewProvider } from '@/lib/services/migrateSessionsToNewProvider';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Use service role for callback (user context in state parameter)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // user ID
  const error = searchParams.get('error');

  if (error || !code || !state) {
    return NextResponse.redirect(new URL('/tutor/video-setup?error=auth_failed', request.url));
  }

  try {
    // Validate environment variables (trim to remove any whitespace/newlines)
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('❌ Missing Google OAuth credentials:', {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        hasRedirectUri: !!redirectUri
      });
      return NextResponse.redirect(new URL('/tutor/video-setup?error=server_config', request.url));
    }

    console.log('🔄 Exchanging OAuth code for tokens...', {
      hasCode: !!code,
      redirectUri,
      tutorId: state
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
      return NextResponse.redirect(
        new URL(`/tutor/video-setup?error=connection_failed&detail=${encodeURIComponent(`Token exchange ${tokenResponse.status}: ${errorData}`)}`, request.url)
      );
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
      .eq('tutor_id', state)
      .single();

    const previousProvider = existingConnection?.provider;
    const isSwitchingProvider = previousProvider && previousProvider !== 'google_meet';

    // Store connection in database
    const { error: dbError } = await supabase
      .from('tutor_video_provider_connections')
      .upsert({
        tutor_id: state,
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
      return NextResponse.redirect(
        new URL(`/tutor/video-setup?error=connection_failed&detail=${encodeURIComponent(dbError.message ?? dbError.code ?? 'unknown')}`, request.url)
      );
    }

    // If switching from another provider, migrate all future sessions
    if (isSwitchingProvider) {
      console.log(`🔄 Tutor ${state} is switching from ${previousProvider} to google_meet. Migrating sessions...`);
      
      const migrationResult = await migrateSessionsToNewProvider(state, 'google_meet');
      
      if (migrationResult.success) {
        console.log(`✅ Successfully migrated ${migrationResult.migratedCount} sessions to Google Meet`);
        return NextResponse.redirect(
          new URL(`/tutor/video-setup?success=true&migrated=${migrationResult.migratedCount}`, request.url)
        );
      } else {
        console.warn(`⚠️ Session migration completed with issues: ${migrationResult.error}`);
        return NextResponse.redirect(
          new URL(`/tutor/video-setup?success=true&migration_warning=true`, request.url)
        );
      }
    }

    return NextResponse.redirect(new URL('/tutor/video-setup?success=true', request.url));
  } catch (error: any) {
    console.error('❌ OAuth callback error:', error);
    const detail = error?.message ?? 'unknown';
    return NextResponse.redirect(
      new URL(`/tutor/video-setup?error=connection_failed&detail=${encodeURIComponent(detail)}`, request.url)
    );
  }
}

