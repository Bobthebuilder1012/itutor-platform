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
  const stateRaw = searchParams.get('state');
  const error = searchParams.get('error');

  // Decode state — "userId|returnPath" or legacy plain userId
  const stateParts = (stateRaw ?? '').split('|');
  const tutorId = stateParts[0] ?? '';
  const returnTo = stateParts[1] || '/tutor/video-setup';

  if (error || !code || !tutorId) {
    return NextResponse.redirect(new URL(`${returnTo}?error=auth_failed`, request.url));
  }

  try {
    // Validate environment variables (trim to remove any whitespace/newlines)
    const clientId = process.env.ZOOM_CLIENT_ID?.trim();
    const clientSecret = process.env.ZOOM_CLIENT_SECRET?.trim();
    const redirectUri = process.env.ZOOM_REDIRECT_URI?.trim();

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('❌ Missing Zoom OAuth credentials:', {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        hasRedirectUri: !!redirectUri
      });
      return NextResponse.redirect(new URL(`${returnTo}?error=server_config`, request.url));
    }

    console.log('🔄 Exchanging OAuth code for tokens...', {
      hasCode: !!code,
      redirectUri,
      tutorId: state
    });

    // Exchange code for tokens
    const credentials = Buffer.from(
      `${clientId}:${clientSecret}`
    ).toString('base64');

    const tokenResponse = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code,
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
        redirectUri
      });
      throw new Error('Failed to exchange code for tokens');
    }

    const tokens = await tokenResponse.json();

    // Get user info
    const userInfoResponse = await fetch('https://api.zoom.us/v2/users/me', {
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
    const isSwitchingProvider = previousProvider && previousProvider !== 'zoom';

    // Store connection in database
    const { error: dbError } = await supabase
      .from('tutor_video_provider_connections')
      .upsert({
        tutor_id: tutorId,
        provider: 'zoom',
        is_active: true,
        connection_status: 'connected',
        provider_account_email: userInfo.email,
        provider_account_name: `${userInfo.first_name} ${userInfo.last_name}`.trim(),
        access_token_encrypted: encrypt(tokens.access_token),
        refresh_token_encrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        token_expires_at: expiresAt.toISOString()
      }, {
        onConflict: 'tutor_id'
      });

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error('Failed to save connection');
    }

    // If switching from another provider, migrate all future sessions
    if (isSwitchingProvider) {
      console.log(`🔄 Tutor ${tutorId} is switching from ${previousProvider} to zoom. Migrating sessions...`);
      
      const migrationResult = await migrateSessionsToNewProvider(tutorId, 'zoom');
      
      if (migrationResult.success) {
        console.log(`✅ Successfully migrated ${migrationResult.migratedCount} sessions to Zoom`);
        return NextResponse.redirect(
          new URL(`${returnTo}?success=true&migrated=${migrationResult.migratedCount}`, request.url)
        );
      } else {
        console.warn(`⚠️ Session migration completed with issues: ${migrationResult.error}`);
        return NextResponse.redirect(
          new URL(`${returnTo}?success=true&migration_warning=true`, request.url)
        );
      }
    }

    return NextResponse.redirect(new URL(`${returnTo}?success=true`, request.url));
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(new URL(`${returnTo}?error=connection_failed`, request.url));
  }
}

