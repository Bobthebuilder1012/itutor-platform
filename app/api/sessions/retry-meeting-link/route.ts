import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { createMeeting } from '@/lib/services/videoProviders';
import { decrypt, encrypt } from '@/lib/utils/encryption';
import type { Session } from '@/lib/types/sessions';

async function refreshTokensIfNeeded(tutorId: string, provider: string) {
  console.log(`🔄 Checking if tokens need refresh for provider: ${provider}`);
  
  const supabase = getServiceClient();
  
  // Get connection
  const { data: connection, error: connError } = await supabase
    .from('tutor_video_provider_connections')
    .select('*')
    .eq('tutor_id', tutorId)
    .eq('provider', provider)
    .single();

  if (connError || !connection) {
    throw new Error('Video provider connection not found');
  }

  // Check if token is expired or about to expire (within 5 minutes)
  const expiresAt = new Date(connection.token_expires_at);
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

  if (expiresAt > fiveMinutesFromNow) {
    console.log('✅ Token is still valid');
    return; // Token is still valid
  }

  console.log('⚠️  Token expired or expiring soon, refreshing...');

  // Decrypt refresh token
  const refreshToken = decrypt(connection.refresh_token_encrypted);

  // Refresh based on provider
  if (provider === 'google_meet') {
    await refreshGoogleToken(tutorId, refreshToken);
  } else if (provider === 'zoom') {
    await refreshZoomToken(tutorId, refreshToken);
  }
}

async function refreshGoogleToken(tutorId: string, refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    throw new Error('Failed to refresh Google token');
  }

  const data = await response.json();
  const newAccessToken = data.access_token;
  const expiresIn = data.expires_in || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  const supabase = getServiceClient();
  await supabase
    .from('tutor_video_provider_connections')
    .update({
      access_token_encrypted: encrypt(newAccessToken),
      token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('tutor_id', tutorId)
    .eq('provider', 'google_meet');

  console.log('✅ Google token refreshed');
}

async function refreshZoomToken(tutorId: string, refreshToken: string) {
  const response = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error('Failed to refresh Zoom token');
  }

  const data = await response.json();
  const newAccessToken = data.access_token;
  const newRefreshToken = data.refresh_token;
  const expiresIn = data.expires_in || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  const supabase = getServiceClient();
  await supabase
    .from('tutor_video_provider_connections')
    .update({
      access_token_encrypted: encrypt(newAccessToken),
      refresh_token_encrypted: encrypt(newRefreshToken),
      token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('tutor_id', tutorId)
    .eq('provider', 'zoom');

  console.log('✅ Zoom token refreshed');
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // 1. Load session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // 2. Check if already has meeting link
    if (session.join_url) {
      return NextResponse.json({
        success: true,
        message: 'Session already has a meeting link',
        join_url: session.join_url
      });
    }

    // 3. Check session status
    if (!['SCHEDULED', 'JOIN_OPEN'].includes(session.status)) {
      return NextResponse.json(
        { error: 'Can only create meeting links for scheduled sessions' },
        { status: 400 }
      );
    }

    // 4. Automatically refresh tokens if needed
    console.log(`🔄 Auto-refreshing tokens for tutor ${session.tutor_id}...`);
    try {
      await refreshTokensIfNeeded(session.tutor_id, session.provider);
    } catch (tokenError: any) {
      console.error('❌ Token refresh failed:', tokenError);
      return NextResponse.json(
        { 
          error: 'Video provider authentication expired',
          details: 'Please reconnect your video provider in Settings',
          action: 'disconnect_reconnect'
        },
        { status: 401 }
      );
    }

    // 5. Attempt to create meeting
    console.log(`🔄 Retrying meeting creation for session ${sessionId}...`);
    
    try {
      const meetingInfo = await createMeeting(session as Session);
      
      // 6. Update session with meeting info
      const { data: updatedSession, error: updateError } = await supabase
        .from('sessions')
        .update({
          meeting_external_id: meetingInfo.meeting_external_id,
          join_url: meetingInfo.join_url,
          meeting_created_at: meetingInfo.meeting_created_at
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Failed to update session:', updateError);
        return NextResponse.json(
          { error: 'Failed to update session with meeting link' },
          { status: 500 }
        );
      }

      console.log('✅ Meeting link created successfully');
      
      return NextResponse.json({
        success: true,
        message: 'Meeting link created successfully',
        join_url: meetingInfo.join_url
      });

    } catch (meetingError: any) {
      console.error('❌ Failed to create meeting:', meetingError);
      
      return NextResponse.json(
        { 
          error: 'Failed to create meeting link',
          details: meetingError.message,
          action: 'Please check that the tutor has a valid video provider connection'
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('❌ Error in retry-meeting-link:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
