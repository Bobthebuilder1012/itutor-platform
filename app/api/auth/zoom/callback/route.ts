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
    // Exchange code for tokens
    const credentials = Buffer.from(
      `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
    ).toString('base64');

    const tokenResponse = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code,
        redirect_uri: process.env.ZOOM_REDIRECT_URI!,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
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
      .eq('tutor_id', state)
      .single();

    const previousProvider = existingConnection?.provider;
    const isSwitchingProvider = previousProvider && previousProvider !== 'zoom';

    // Store connection in database
    const { error: dbError } = await supabase
      .from('tutor_video_provider_connections')
      .upsert({
        tutor_id: state,
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
      console.log(`🔄 Tutor ${state} is switching from ${previousProvider} to zoom. Migrating sessions...`);
      
      const migrationResult = await migrateSessionsToNewProvider(state, 'zoom');
      
      if (migrationResult.success) {
        console.log(`✅ Successfully migrated ${migrationResult.migratedCount} sessions to Zoom`);
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
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(new URL('/tutor/video-setup?error=connection_failed', request.url));
  }
}

