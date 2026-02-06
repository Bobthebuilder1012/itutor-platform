import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { createMeeting } from '@/lib/services/videoProviders';
import type { Session } from '@/lib/types/sessions';

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

    // 4. Attempt to create meeting
    console.log(`🔄 Retrying meeting creation for session ${sessionId}...`);
    
    try {
      const meetingInfo = await createMeeting(session as Session);
      
      // 5. Update session with meeting info
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
