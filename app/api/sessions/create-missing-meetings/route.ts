import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { createMeeting } from '@/lib/services/videoProviders';
import type { Session } from '@/lib/types/sessions';

export async function POST(request: NextRequest) {
  try {
    console.log('🔧 Creating meetings for sessions without links...');
    const supabase = getServiceClient();

    // Find all sessions without meeting links
    const { data: sessions, error: fetchError } = await supabase
      .from('sessions')
      .select('*')
      .is('join_url', null)
      .gt('scheduled_start_at', new Date().toISOString()) // Only upcoming sessions
      .order('scheduled_start_at', { ascending: true });

    if (fetchError) {
      console.error('❌ Error fetching sessions:', fetchError);
      throw new Error('Failed to fetch sessions');
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ 
        message: 'No sessions need meeting links',
        count: 0 
      });
    }

    console.log(`📋 Found ${sessions.length} sessions without meeting links`);

    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[]
    };

    // Create meetings for each session
    for (const session of sessions) {
      try {
        console.log(`  🔄 Creating meeting for session ${session.id}...`);
        const meetingInfo = await createMeeting(session as Session);
        
        // Update session with meeting info
        const { error: updateError } = await supabase
          .from('sessions')
          .update({
            meeting_external_id: meetingInfo.meeting_external_id,
            join_url: meetingInfo.join_url,
            meeting_created_at: meetingInfo.meeting_created_at
          })
          .eq('id', session.id);

        if (updateError) {
          throw updateError;
        }

        results.success++;
        console.log(`  ✅ Meeting created for session ${session.id}`);
      } catch (err) {
        results.failed++;
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`  ❌ Failed for session ${session.id}:`, errorMsg);
        results.errors.push({
          session_id: session.id,
          error: errorMsg
        });
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Complete: ${results.success} meetings created`);
    if (results.failed > 0) {
      console.log(`⚠️  Failed: ${results.failed} sessions`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return NextResponse.json({
      message: 'Meeting creation complete',
      total: sessions.length,
      success: results.success,
      failed: results.failed,
      errors: results.errors
    });
  } catch (error) {
    console.error('❌ Error in create-missing-meetings:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create meetings' },
      { status: 500 }
    );
  }
}
