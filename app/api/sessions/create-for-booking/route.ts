import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { pinSessionToCommunity } from '@/lib/subject-communities';
import { createSessionForBooking } from '@/lib/services/sessionService';

export async function POST(request: NextRequest) {
  try {
    const { booking_id } = await request.json();
    
    console.log('📝 Session creation requested for booking:', booking_id);
    
    if (!booking_id) {
      console.error('❌ No booking_id provided');
      return NextResponse.json(
        { error: 'booking_id required' },
        { status: 400 }
      );
    }

    console.log('🔄 Calling createSessionForBooking...');
    const session = await createSessionForBooking(booking_id);
    
    console.log('✅ Session created successfully:', session.id);

    // Phase 5: if this is a community session, pin it and post system message
    const communityId = (session as { community_id?: string }).community_id;
    if (communityId && session.scheduled_end_at) {
      const admin = getServiceClient();
      await pinSessionToCommunity(admin, communityId, session.id, session.scheduled_end_at);
    }

    return NextResponse.json({ session }, { status: 200 });
  } catch (error) {
    console.error('❌ Error creating session:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create session' },
      { status: 500 }
    );
  }
}

