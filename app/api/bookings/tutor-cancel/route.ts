import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { booking_id, reason } = await request.json();

    if (!booking_id) {
      return NextResponse.json({ error: 'booking_id required' }, { status: 400 });
    }

    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();
    const { data: booking, error: bookingError } = await admin
      .from('bookings')
      .select('id, tutor_id, status')
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { error: updateError } = await admin
      .from('bookings')
      .update({
        status: 'CANCELLED',
        last_action_by: 'tutor',
        updated_at: new Date().toISOString()
      })
      .eq('id', booking_id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 });
    }

    if (reason) {
      await admin.from('booking_messages').insert({
        booking_id,
        sender_id: user.id,
        message_type: 'text',
        body: reason
      });
    }

    await admin.from('booking_messages').insert({
      booking_id,
      sender_id: user.id,
      message_type: 'system',
      body: 'Booking cancelled by tutor'
    });

    return NextResponse.json({ success: true, status: 'CANCELLED' }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel booking' },
      { status: 500 }
    );
  }
}
