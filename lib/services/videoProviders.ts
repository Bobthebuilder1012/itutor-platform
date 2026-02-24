// =====================================================
// VIDEO PROVIDERS SERVICE
// =====================================================
// Real Google Meet and Zoom API integration

import { getServiceClient } from '@/lib/supabase/server';
import { decrypt, encrypt } from '@/lib/utils/encryption';
import type {
  VideoProvider,
  TutorVideoConnection,
  Session,
  MeetingInfo,
  MeetingState
} from '@/lib/types/sessions';

// =====================================================
// TOKEN REFRESH HELPERS
// =====================================================

async function refreshGoogleToken(tutorId: string, refreshToken: string): Promise<string> {
  console.log('🔄 Refreshing Google access token...');
  
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
    const error = await response.text();
    console.error('❌ Failed to refresh Google token:', error);
    throw new Error('Failed to refresh Google access token');
  }

  const data = await response.json();
  const newAccessToken = data.access_token;
  const expiresIn = data.expires_in || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  // Update database with new token
  const supabase = getServiceClient();
  const { error: updateError } = await supabase
    .from('tutor_video_provider_connections')
    .update({
      access_token_encrypted: encrypt(newAccessToken),
      token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('tutor_id', tutorId)
    .eq('provider', 'google_meet');

  if (updateError) {
    console.error('❌ Failed to update Google token in database:', updateError);
    throw new Error('Failed to update token');
  }

  console.log('✅ Google token refreshed successfully');
  return newAccessToken;
}

async function refreshZoomToken(tutorId: string, refreshToken: string): Promise<string> {
  console.log('🔄 Refreshing Zoom access token...');
  
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
    const error = await response.text();
    console.error('❌ Failed to refresh Zoom token:', error);
    throw new Error('Failed to refresh Zoom access token');
  }

  const data = await response.json();
  const newAccessToken = data.access_token;
  const newRefreshToken = data.refresh_token; // Zoom returns a new refresh token too
  const expiresIn = data.expires_in || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  // Update database with new tokens
  const supabase = getServiceClient();
  const { error: updateError } = await supabase
    .from('tutor_video_provider_connections')
    .update({
      access_token_encrypted: encrypt(newAccessToken),
      refresh_token_encrypted: encrypt(newRefreshToken),
      token_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('tutor_id', tutorId)
    .eq('provider', 'zoom');

  if (updateError) {
    console.error('❌ Failed to update Zoom token in database:', updateError);
    throw new Error('Failed to update token');
  }

  console.log('✅ Zoom token refreshed successfully');
  return newAccessToken;
}

// =====================================================
// PROVIDER ADAPTER INTERFACE
// =====================================================

export interface VideoProviderAdapter {
  createMeeting(session: Session): Promise<MeetingInfo>;
  getMeetingState(session: Session): Promise<MeetingState>;
  getAuthUrl(tutorId: string): string;
  handleCallback(code: string, tutorId: string): Promise<TutorVideoConnection>;
}

// =====================================================
// REAL API IMPLEMENTATIONS
// =====================================================

class GoogleMeetAdapter implements VideoProviderAdapter {
  async createMeeting(session: Session): Promise<MeetingInfo> {
    return this.createMeetingWithRetry(session, false);
  }

  private async createMeetingWithRetry(session: Session, isRetry: boolean): Promise<MeetingInfo> {
    console.log(`🔵 [GoogleMeet] Creating meeting for session ${session.id} (retry: ${isRetry})`);
    
    // Get tutor's connection
    const supabase = getServiceClient();
    console.log(`🔍 [GoogleMeet] Looking up connection for tutor ${session.tutor_id}`);
    
    const { data: connection, error } = await supabase
      .from('tutor_video_provider_connections')
      .select('*')
      .eq('tutor_id', session.tutor_id)
      .eq('provider', 'google_meet')
      .single();

    if (error || !connection) {
      console.error('❌ [GoogleMeet] No connection found:', error);
      throw new Error('No Google Meet connection found. Please connect Google Meet in Settings.');
    }

    console.log('✅ [GoogleMeet] Connection found, expires:', connection.token_expires_at);
    let accessToken = decrypt(connection.access_token_encrypted);
    
    // Calculate end time
    const startDate = new Date(session.scheduled_start_at);
    const endDate = new Date(startDate.getTime() + session.duration_minutes * 60000);
    console.log(`📅 [GoogleMeet] Meeting time: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Create Google Calendar event with Meet
    console.log('📡 [GoogleMeet] Calling Google Calendar API...');
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: `iTutor Session`,
        description: `Tutoring session via iTutor`,
        start: { dateTime: startDate.toISOString() },
        end: { dateTime: endDate.toISOString() },
        conferenceData: {
          createRequest: {
            requestId: `itutor-${session.id}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      })
    });

    console.log('📥 [GoogleMeet] API response status:', response.status);

    // Handle token expiration
    if (!response.ok && (response.status === 401 || response.status === 403) && !isRetry) {
      console.log('🔄 [GoogleMeet] Token expired (status: ${response.status}), refreshing...');
      const refreshToken = decrypt(connection.refresh_token_encrypted);
      await refreshGoogleToken(session.tutor_id, refreshToken);
      // Retry once with new token
      return this.createMeetingWithRetry(session, true);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [GoogleMeet] API error:', errorText);
      throw new Error(`Google Meet API error (${response.status}): ${errorText}`);
    }

    const event = await response.json();
    console.log('✅ [GoogleMeet] Event created:', event.id);
    
    const joinUrl = event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || '';
    if (!joinUrl) {
      console.error('⚠️  [GoogleMeet] No join URL in response:', JSON.stringify(event, null, 2));
      throw new Error('Google Meet link not found in calendar event');
    }
    
    console.log('✅ [GoogleMeet] Join URL:', joinUrl);
    
    return {
      meeting_external_id: event.id,
      join_url: joinUrl,
      meeting_created_at: new Date().toISOString()
    };
  }

  async getMeetingState(session: Session): Promise<MeetingState> {
    // For MVP, return empty state
    // In production, could query Calendar API for actual meeting status
    return {};
  }

  getAuthUrl(tutorId: string): string {
    return `/api/auth/google/connect`;
  }

  async handleCallback(code: string, tutorId: string): Promise<TutorVideoConnection> {
    // Handled by API route
    throw new Error('Use API route for OAuth callback');
  }
}

class ZoomAdapter implements VideoProviderAdapter {
  async createMeeting(session: Session): Promise<MeetingInfo> {
    return this.createMeetingWithRetry(session, false);
  }

  private async createMeetingWithRetry(session: Session, isRetry: boolean): Promise<MeetingInfo> {
    console.log(`🔵 [Zoom] Creating meeting for session ${session.id} (retry: ${isRetry})`);
    
    // Get tutor's connection
    const supabase = getServiceClient();
    console.log(`🔍 [Zoom] Looking up connection for tutor ${session.tutor_id}`);
    
    const { data: connection, error } = await supabase
      .from('tutor_video_provider_connections')
      .select('*')
      .eq('tutor_id', session.tutor_id)
      .eq('provider', 'zoom')
      .single();

    if (error || !connection) {
      console.error('❌ [Zoom] No connection found:', error);
      throw new Error('No Zoom connection found. Please connect Zoom in Settings.');
    }

    console.log('✅ [Zoom] Connection found, expires:', connection.token_expires_at);
    let accessToken = decrypt(connection.access_token_encrypted);

    const startTime = new Date(session.scheduled_start_at).toISOString();
    console.log(`📅 [Zoom] Meeting start: ${startTime}, duration: ${session.duration_minutes} mins`);

    console.log('📡 [Zoom] Calling Zoom API...');
    const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topic: `iTutor Session`,
        type: 2, // Scheduled meeting
        start_time: startTime,
        duration: session.duration_minutes,
        settings: {
          join_before_host: true,
          waiting_room: false,
          mute_upon_entry: false
        }
      })
    });

    console.log('📥 [Zoom] API response status:', response.status);

    // Handle token expiration
    if (!response.ok && response.status === 401 && !isRetry) {
      console.log('🔄 [Zoom] Token expired (status: ${response.status}), refreshing...');
      const refreshToken = decrypt(connection.refresh_token_encrypted);
      await refreshZoomToken(session.tutor_id, refreshToken);
      // Retry once with new token
      return this.createMeetingWithRetry(session, true);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [Zoom] API error:', errorText);
      throw new Error(`Zoom API error (${response.status}): ${errorText}`);
    }

    const meeting = await response.json();
    console.log('✅ [Zoom] Meeting created:', meeting.id);
    
    if (!meeting.join_url) {
      console.error('⚠️  [Zoom] No join URL in response:', JSON.stringify(meeting, null, 2));
      throw new Error('Zoom join URL not found in API response');
    }
    
    console.log('✅ [Zoom] Join URL:', meeting.join_url);
    
    return {
      meeting_external_id: meeting.id.toString(),
      join_url: meeting.join_url,
      meeting_created_at: new Date().toISOString()
    };
  }

  async getMeetingState(session: Session): Promise<MeetingState> {
    // For MVP, return empty state
    // In production, could query Zoom API for meeting metrics
    return {};
  }

  getAuthUrl(tutorId: string): string {
    return `/api/auth/zoom/connect`;
  }

  async handleCallback(code: string, tutorId: string): Promise<TutorVideoConnection> {
    // Handled by API route
    throw new Error('Use API route for OAuth callback');
  }
}

// =====================================================
// PROVIDER FACTORY
// =====================================================

function getProviderAdapter(provider: VideoProvider): VideoProviderAdapter {
  switch (provider) {
    case 'google_meet':
      return new GoogleMeetAdapter();
    case 'zoom':
      return new ZoomAdapter();
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// =====================================================
// PUBLIC API
// =====================================================

/**
 * Ensure tutor has a valid video provider connection
 */
export async function ensureTutorConnected(
  tutorId: string
): Promise<{ provider: VideoProvider; status: string }> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('tutor_video_provider_connections')
    .select('*')
    .eq('tutor_id', tutorId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.error('❌ ensureTutorConnected error:', error);
    console.error('❌ Looking for tutor_id:', tutorId);
    throw new Error('No video provider connected');
  }

  if (data.connection_status !== 'connected') {
    throw new Error(`Video provider needs reauth: ${data.connection_status}`);
  }

  return {
    provider: data.provider as VideoProvider,
    status: data.connection_status
  };
}

/**
 * Create a meeting for a session
 */
export async function createMeeting(session: Session): Promise<MeetingInfo> {
  const adapter = getProviderAdapter(session.provider);
  return adapter.createMeeting(session);
}

/**
 * Get meeting state (start/end times)
 */
export async function getMeetingState(session: Session): Promise<MeetingState> {
  const adapter = getProviderAdapter(session.provider);
  return adapter.getMeetingState(session);
}

/**
 * Get OAuth URL for provider
 */
export function getProviderAuthUrl(
  provider: VideoProvider,
  tutorId: string
): string {
  const adapter = getProviderAdapter(provider);
  return adapter.getAuthUrl(tutorId);
}

/**
 * Check if tutor can accept bookings (has valid video connection)
 */
export async function canTutorAcceptBookings(tutorId: string): Promise<boolean> {
  try {
    const { status } = await ensureTutorConnected(tutorId);
    return status === 'connected';
  } catch {
    return false;
  }
}

