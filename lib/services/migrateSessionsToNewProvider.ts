/**
 * Migrates all future sessions to a new video provider
 * Called when a tutor switches from Google Meet to Zoom or vice versa
 */

import { getServiceClient } from '@/lib/supabase/server';
import { createMeeting } from './videoProviders';

export async function migrateSessionsToNewProvider(
  tutorId: string,
  newProvider: 'google_meet' | 'zoom'
): Promise<{ success: boolean; migratedCount: number; error?: string }> {
  const supabase = getServiceClient();

  try {
    console.log(`🔄 Starting session migration for tutor ${tutorId} to ${newProvider}`);

    // Get all future sessions for this tutor that are scheduled or have join open
    const { data: futureSessions, error: fetchError } = await supabase
      .from('sessions')
      .select('*')
      .eq('tutor_id', tutorId)
      .in('status', ['SCHEDULED', 'JOIN_OPEN'])
      .gte('scheduled_start_at', new Date().toISOString());

    if (fetchError) {
      console.error('❌ Error fetching future sessions:', fetchError);
      return { success: false, migratedCount: 0, error: fetchError.message };
    }

    if (!futureSessions || futureSessions.length === 0) {
      console.log('✅ No future sessions to migrate');
      return { success: true, migratedCount: 0 };
    }

    console.log(`📋 Found ${futureSessions.length} future sessions to migrate`);

    let migratedCount = 0;
    const errors: string[] = [];

    // Migrate each session
    for (const session of futureSessions) {
      try {
        console.log(`🔄 Migrating session ${session.id}...`);

        // Get booking details for the session
        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', session.booking_id)
          .single();

        if (bookingError || !booking) {
          console.error(`❌ Error fetching booking ${session.booking_id}:`, bookingError);
          errors.push(`Session ${session.id}: Failed to fetch booking`);
          continue;
        }

        // Create new meeting with the new provider
        // We need to create a temporary session object with the new provider
        const tempSession = {
          ...session,
          provider: newProvider // Use the NEW provider
        };

        console.log(`🔄 Creating ${newProvider} meeting for session ${session.id}...`);
        console.log(`📋 Session details:`, {
          sessionId: session.id,
          tutorId: tutorId,
          studentId: session.student_id,
          scheduledStart: session.scheduled_start_at,
          currentProvider: session.provider,
          newProvider: newProvider
        });

        let meetingInfo;
        try {
          meetingInfo = await createMeeting(tempSession);
          console.log(`✅ Meeting created successfully:`, {
            meetingId: meetingInfo.id,
            joinUrl: meetingInfo.joinUrl
          });
        } catch (meetingError) {
          console.error(`❌ Failed to create meeting for session ${session.id}:`, meetingError);
          console.error(`❌ Full error details:`, meetingError);
          errors.push(`Session ${session.id}: ${meetingError instanceof Error ? meetingError.message : 'Failed to create meeting'}`);
          continue;
        }

        // Update session with new provider and meeting details
        const { error: updateError } = await supabase
          .from('sessions')
          .update({
            provider: newProvider,
            meeting_external_id: meetingInfo.id,
            join_url: meetingInfo.joinUrl,
            meeting_created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', session.id);

        if (updateError) {
          console.error(`❌ Error updating session ${session.id}:`, updateError);
          errors.push(`Session ${session.id}: ${updateError.message}`);
          continue;
        }

        console.log(`✅ Successfully migrated session ${session.id} to ${newProvider}`);
        migratedCount++;
      } catch (err) {
        console.error(`❌ Error migrating session ${session.id}:`, err);
        errors.push(`Session ${session.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (errors.length > 0) {
      console.warn(`⚠️ Completed with ${errors.length} errors:`, errors);
    }

    console.log(`✅ Migration complete. Migrated ${migratedCount}/${futureSessions.length} sessions to ${newProvider}`);

    return {
      success: errors.length === 0,
      migratedCount,
      error: errors.length > 0 ? `Some sessions failed to migrate: ${errors.join(', ')}` : undefined
    };
  } catch (err) {
    console.error('❌ Fatal error during session migration:', err);
    return {
      success: false,
      migratedCount: 0,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

